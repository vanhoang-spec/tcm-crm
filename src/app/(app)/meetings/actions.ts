"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AiError, aiChatJson, isAiConfigured } from "@/lib/ai/deepseek";
import { meetingParseMessages, meetingParseSchema } from "@/lib/ai/meeting-prompts";
import { extractTextFromFile } from "@/lib/ai/extract-text";
import { hasPermission } from "@/lib/permissions";
import {
  MAX_MEETING_FILE_BYTES,
  MAX_MEETING_TEXT_CHARS,
  MEETING_FILE_MIME_TYPES,
  RAG_CODES,
  matchAssignee,
  matchParsedRows,
  parseWeekKey,
  weekKey,
} from "@/lib/meetings";
import { buildWeeklyPackMarkdown, loadMatchContext, weekLabel } from "@/lib/meetings-server";
import { canAccessTeam, requireMeetingAccess } from "./access";

/**
 * MEET-1 — Server actions của biên bản họp tuần. Mọi action: `requireMeetingAccess()` câu đầu, rồi
 * `canAccessTeam(access, teamId, write)` với teamId ĐỌC TỪ DB (meeting/team), không tin payload.
 * Mã lỗi trả về dạng KEY (client dịch qua i18n) — khuôn purchasing/vendors.
 */
export type MeetingFormState = { error?: string; errorDetail?: string; success?: boolean; meetingId?: string };

/** "YYYY-MM-DD" → UTC-midnight (HANDOVER 4.3); Zod đã kiểm định dạng ở payload. */
const dateOrNull = (s: string | null | undefined): Date | null => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s) : null);

const ragSchema = z.enum(RAG_CODES).nullable().optional();
const rowSchema = z.object({
  id: z.string().nullable().optional(),
  clientId: z.string().min(1),
  projectId: z.string().nullable().optional(),
  rag: ragSchema,
  update: z.string().max(4000).optional().default(""),
  risks: z.string().max(2000).optional().default(""),
  nextSteps: z.string().max(2000).optional().default(""),
});
const actionSchema = z.object({
  id: z.string().nullable().optional(),
  title: z.string().min(1).max(300),
  assigneeStaffId: z.string().transform((v) => v.trim() || null).nullable().default(null),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["OPEN", "DONE"]).default("OPEN"),
  /** Chỉ số dòng trong `rows` của payload (0-based) hoặc null — server đổi thành rowId sau khi upsert dòng. */
  rowIndex: z.number().int().min(0).nullable().optional(),
});
const payloadSchema = z.object({
  teamId: z.string().min(1),
  weekKey: z.string(),
  note: z.string().max(4000).optional().default(""),
  rows: z.array(rowSchema).max(200),
  deleteRowIds: z.array(z.string()).max(200).optional().default([]),
  actions: z.array(actionSchema).max(200),
  deleteActionIds: z.array(z.string()).max(200).optional().default([]),
  /** MEET-2: biên bản thô đã dùng để AI bóc — lưu kèm khi người dùng bấm Lưu. */
  rawMinutes: z.string().max(60_000).nullable().optional(),
});
export type MeetingSavePayload = z.infer<typeof payloadSchema>;

async function auditMeeting(meetingId: string, action: string, changedBy: string, note: string) {
  await prisma.auditLog.create({ data: { entityType: "account_meeting", entityId: meetingId, field: "*", newValue: note, action, changedBy } });
}

export async function saveMeeting(_prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  const access = await requireMeetingAccess();
  let payload: MeetingSavePayload;
  try {
    payload = payloadSchema.parse(JSON.parse(String(formData.get("payload") ?? "{}")));
  } catch {
    return { error: "BAD_PAYLOAD" };
  }
  const team = await prisma.team.findUnique({ where: { id: payload.teamId }, select: { id: true, code: true, isActive: true } });
  if (!team) return { error: "NOT_FOUND" };
  if (!canAccessTeam(access, team.id, true)) return { error: "NO_ACCESS" };
  const weekStart = parseWeekKey(payload.weekKey);
  if (!weekStart) return { error: "BAD_WEEK" };

  const existing = await prisma.accountMeeting.findUnique({
    where: { teamId_weekStart: { teamId: team.id, weekStart } },
    select: { id: true, finalizedAt: true, rows: { select: { id: true } }, actions: { select: { id: true, assigneeStaffId: true, status: true } } },
  });
  if (existing?.finalizedAt) return { error: "FINALIZED" };

  // ── Kiểm dòng: dự án phải tồn tại (clientId lấy từ DB), khách phải tồn tại; chặn trùng dự án / trùng khách-không-dự-án.
  const projectIds = [...new Set(payload.rows.map((r) => r.projectId).filter((x): x is string => !!x))];
  const projects = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, clientId: true } });
  const projectClient = new Map(projects.map((p) => [p.id, p.clientId]));
  if (projects.length !== projectIds.length) return { error: "NOT_FOUND" };
  const clientIds = [...new Set(payload.rows.filter((r) => !r.projectId).map((r) => r.clientId))];
  const clientCount = clientIds.length ? await prisma.client.count({ where: { id: { in: clientIds } } }) : 0;
  if (clientCount !== clientIds.length) return { error: "NOT_FOUND" };
  const seenP = new Set<string>();
  const seenC = new Set<string>();
  for (const r of payload.rows) {
    if (r.projectId) {
      if (seenP.has(r.projectId)) return { error: "DUP_ROW" };
      seenP.add(r.projectId);
    } else {
      if (seenC.has(r.clientId)) return { error: "DUP_ROW" };
      seenC.add(r.clientId);
    }
  }
  const existingRowIds = new Set((existing?.rows ?? []).map((r) => r.id));
  const existingActions = new Map((existing?.actions ?? []).map((a) => [a.id, a]));
  for (const r of payload.rows) if (r.id && !existingRowIds.has(r.id)) return { error: "NOT_FOUND" };
  for (const a of payload.actions) {
    if (a.id && !existingActions.has(a.id)) return { error: "NOT_FOUND" };
    if (a.rowIndex != null && a.rowIndex >= payload.rows.length) return { error: "BAD_PAYLOAD" };
  }
  // Việc CHƯA GÁN NGƯỜI được phép lưu (quyết định chủ dự án 18/08/2026): biên bản tuần thật có 38 việc
  // thì 28 việc chưa ghi ai làm — bắt gán đủ mới cho lưu là ép người chủ trì bịa tên ngay tại buổi họp.
  // Việc chưa gán vẫn mang sang tuần sau như mọi việc còn mở, chỉ là chưa báo cho ai.
  const assigneeIds = [...new Set(payload.actions.map((a) => a.assigneeStaffId).filter((x): x is string => !!x))];
  const assignees = await prisma.staff.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, isActive: true, fullName: true } });
  if (assignees.length !== assigneeIds.length) return { error: "NOT_FOUND" };
  const assigneeById = new Map(assignees.map((s) => [s.id, s]));

  // Dòng NHÁP hoàn toàn trống (dự án đang chạy chưa ai ghi gì) thì không tạo — tuần sau vẫn hiện lại làm nháp.
  const isEmpty = (r: MeetingSavePayload["rows"][number]) => !r.id && !r.rag && !r.update.trim() && !r.risks.trim() && !r.nextSteps.trim();

  const now = new Date();
  const notify: { actionId: string; assigneeStaffId: string; title: string; dueDate: Date | null; projectId: string | null }[] = [];
  const meetingId = await prisma.$transaction(async (tx) => {
    const m = existing
      ? await tx.accountMeeting.update({ where: { id: existing.id }, data: { note: payload.note.trim() || null, ...(payload.rawMinutes !== undefined ? { rawMinutes: payload.rawMinutes, aiParsedAt: payload.rawMinutes ? now : null } : {}) }, select: { id: true } })
      : await tx.accountMeeting.create({ data: { teamId: team.id, weekStart, note: payload.note.trim() || null, createdById: access.meId, rawMinutes: payload.rawMinutes ?? null, aiParsedAt: payload.rawMinutes ? now : null }, select: { id: true } });
    if (payload.deleteRowIds.length) await tx.accountMeetingRow.deleteMany({ where: { id: { in: payload.deleteRowIds }, meetingId: m.id } });
    if (payload.deleteActionIds.length) await tx.accountMeetingAction.deleteMany({ where: { id: { in: payload.deleteActionIds }, meetingId: m.id } });

    const rowIdByIndex = new Map<number, string>();
    let sort = 0;
    for (let i = 0; i < payload.rows.length; i++) {
      const r = payload.rows[i];
      if (isEmpty(r)) continue;
      const data = {
        clientId: r.projectId ? projectClient.get(r.projectId)! : r.clientId,
        projectId: r.projectId ?? null,
        rag: r.rag ?? null,
        update: r.update.trim() || null,
        risks: r.risks.trim() || null,
        nextSteps: r.nextSteps.trim() || null,
        sort: sort++,
      };
      const saved = r.id
        ? await tx.accountMeetingRow.update({ where: { id: r.id }, data, select: { id: true, projectId: true } })
        : await tx.accountMeetingRow.create({ data: { meetingId: m.id, ...data }, select: { id: true, projectId: true } });
      rowIdByIndex.set(i, saved.id);
    }
    for (const a of payload.actions) {
      const rowId = a.rowIndex != null ? (rowIdByIndex.get(a.rowIndex) ?? null) : null;
      const rowProject = rowId ? (payload.rows[a.rowIndex!].projectId ?? null) : null;
      const due = a.dueDate ? dateOrNull(a.dueDate) : null;
      const prev = a.id ? existingActions.get(a.id) : undefined;
      const statusData = a.status === "DONE" ? (prev?.status === "DONE" ? {} : { doneAt: now, doneInMeetingId: m.id }) : prev?.status === "DONE" ? { doneAt: null, doneInMeetingId: null } : {};
      const saved = a.id
        ? await tx.accountMeetingAction.update({ where: { id: a.id }, data: { title: a.title.trim(), assigneeStaffId: a.assigneeStaffId, dueDate: due, status: a.status, rowId, ...statusData }, select: { id: true } })
        : await tx.accountMeetingAction.create({ data: { meetingId: m.id, title: a.title.trim(), assigneeStaffId: a.assigneeStaffId, dueDate: due, status: a.status, rowId, ...statusData }, select: { id: true } });
      // Thông báo khi việc MỚI hoặc ĐỔI người phụ trách (và việc còn mở).
      // Chưa gán người thì KHÔNG có ai để báo — gán sau (đổi người) sẽ rơi vào đúng nhánh này và báo lúc đó.
      if (a.status === "OPEN" && a.assigneeStaffId && (!prev || prev.assigneeStaffId !== a.assigneeStaffId)) {
        notify.push({ actionId: saved.id, assigneeStaffId: a.assigneeStaffId, title: a.title.trim(), dueDate: due, projectId: rowProject });
      }
    }
    return m.id;
  });

  // Fan-out notification SAU commit (HANDOVER 10.9). Người đã nghỉ thì lưu việc nhưng không gửi.
  const wk = weekKey(weekStart);
  for (const n of notify) {
    const s = assigneeById.get(n.assigneeStaffId);
    if (!s?.isActive) continue;
    await prisma.notification.create({
      data: {
        recipientStaffId: n.assigneeStaffId,
        type: "MEETING_ACTION_ASSIGNED",
        title: `Việc từ họp team ${team.code}: ${n.title}`,
        body: `Được giao trong buổi họp tuần ${wk}${n.dueDate ? ` · hạn ${weekKey(n.dueDate).split("-").reverse().join("/")}` : ""}.`,
        projectId: n.projectId,
      },
    });
    await prisma.accountMeetingAction.update({ where: { id: n.actionId }, data: { notifiedAt: now } });
  }
  await auditMeeting(meetingId, existing ? "UPDATE" : "CREATE", access.meId, JSON.stringify({ team: team.code, week: wk, rows: payload.rows.filter((r) => !isEmpty(r)).length, actions: payload.actions.length, deletedRows: payload.deleteRowIds.length, deletedActions: payload.deleteActionIds.length, notified: notify.length }));
  revalidatePath("/meetings");
  return { success: true, meetingId };
}

/** Đánh dấu / bỏ đánh dấu xong một việc — dùng cho VIỆC TỒN từ tuần trước (được phép kể cả khi meeting gốc đã chốt). */
export async function setActionStatus(actionId: string, status: "OPEN" | "DONE", viewMeetingId: string | null, _formData: FormData): Promise<void> {
  const access = await requireMeetingAccess();
  const a = await prisma.accountMeetingAction.findUnique({ where: { id: actionId }, select: { id: true, status: true, meeting: { select: { id: true, teamId: true } } } });
  if (!a || !canAccessTeam(access, a.meeting.teamId, true)) return;
  if (a.status === status) return;
  await prisma.accountMeetingAction.update({
    where: { id: actionId },
    data: status === "DONE" ? { status, doneAt: new Date(), doneInMeetingId: viewMeetingId ?? a.meeting.id } : { status, doneAt: null, doneInMeetingId: null },
  });
  revalidatePath("/meetings");
}

export async function finalizeMeeting(meetingId: string, _formData: FormData): Promise<void> {
  const access = await requireMeetingAccess();
  const m = await prisma.accountMeeting.findUnique({ where: { id: meetingId }, select: { id: true, teamId: true, finalizedAt: true } });
  if (!m || !canAccessTeam(access, m.teamId, true) || m.finalizedAt) return;
  await prisma.accountMeeting.update({ where: { id: meetingId }, data: { finalizedAt: new Date(), finalizedById: access.meId } });
  await auditMeeting(meetingId, "FINALIZE", access.meId, "");
  revalidatePath("/meetings");
}

export async function reopenMeeting(meetingId: string, _formData: FormData): Promise<void> {
  const access = await requireMeetingAccess();
  const m = await prisma.accountMeeting.findUnique({ where: { id: meetingId }, select: { id: true, teamId: true, finalizedAt: true } });
  if (!m || !canAccessTeam(access, m.teamId, true) || !m.finalizedAt) return;
  await prisma.accountMeeting.update({ where: { id: meetingId }, data: { finalizedAt: null, finalizedById: null } });
  await auditMeeting(meetingId, "REOPEN", access.meId, "");
  revalidatePath("/meetings");
}

// ─────────────────────────────────────────────────────────
// MEET-2 — AI đọc biên bản + xuất gói họp tuần
// ─────────────────────────────────────────────────────────

export type MinutesParseState = {
  error?: string;
  errorDetail?: string;
  parsed?: {
    rows: { clientId: string; projectId: string | null; rag: string | null; update: string; risks: string; nextSteps: string; matchedBy: string }[];
    actions: { title: string; assigneeStaffId: string | null; assigneeName: string; dueDate: string | null }[];
    unmatched: { label: string; update: string }[];
    generalNote: string;
    truncated: boolean;
    rawMinutes: string;
  };
};

/**
 * Đọc biên bản (dán tay hoặc file) bằng AI → TRẢ VỀ FORM để người chủ trì duyệt. KHÔNG ghi DB
 * (mirror `parseCvWithAi`, HANDOVER 10.31): `rawMinutes` chỉ vào DB khi người dùng bấm Lưu ở form chính.
 * ⚠ Quyền: `requireMeetingAccess()` + `canAccessTeam` rồi mới kiểm `meetings.ai_import` BÊN TRONG action —
 * AI là ĐẶC QUYỀN THÊM (tính tiền theo lượt), không phải đường vòng thay quyền ghi.
 */
export async function parseMinutesWithAi(_prev: MinutesParseState, formData: FormData): Promise<MinutesParseState> {
  const access = await requireMeetingAccess();
  const teamId = String(formData.get("teamId") ?? "");
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, code: true } });
  if (!team) return { error: "NOT_FOUND" };
  if (!canAccessTeam(access, team.id, true)) return { error: "NO_ACCESS" };
  if (!(await hasPermission("meetings.ai_import"))) return { error: "NO_AI_PERM" };
  const weekStart = parseWeekKey(String(formData.get("weekKey") ?? ""));
  if (!weekStart) return { error: "BAD_WEEK" };
  if (!isAiConfigured()) return { error: "AI_NOT_CONFIGURED" };

  // Nguồn văn bản: ô dán ưu tiên; không có thì đọc file.
  let text = String(formData.get("minutes") ?? "").trim();
  let truncated = false;
  if (text.length > MAX_MEETING_TEXT_CHARS) {
    text = text.slice(0, MAX_MEETING_TEXT_CHARS);
    truncated = true;
  }
  if (!text) {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "NO_INPUT" };
    if (file.size > MAX_MEETING_FILE_BYTES) return { error: "TOO_BIG" };
    if (!(MEETING_FILE_MIME_TYPES as readonly string[]).includes(file.type)) return { error: "BAD_TYPE" };
    const extracted = await extractTextFromFile(Buffer.from(await file.arrayBuffer()), file.type, { maxChars: MAX_MEETING_TEXT_CHARS });
    if (!extracted?.text.trim()) return { error: "CANNOT_READ" };
    text = extracted.text;
    truncated = extracted.truncated;
  }

  const { projects, clients, staff } = await loadMatchContext(team.id);
  let raw: unknown;
  try {
    // KHÔNG bọc $transaction quanh AI (SQLite single-writer, một lượt gọi tới 75s — HANDOVER 10.14).
    raw = await aiChatJson(
      meetingParseMessages({
        teamCode: team.code,
        weekLabel: weekLabel(weekStart),
        projects: projects.map((p) => ({ code: p.code, name: p.name, clientName: p.client.name })),
        clients: clients.map((c) => ({ code: c.code, name: c.name })),
        staff: staff.map((s) => s.fullName),
        minutesText: text,
      }),
      // 8000 = trần output của deepseek-chat. Dashboard tuần thật (13 khách + 38 việc) đo được vượt
      // 6000 token ⇒ JSON bị cắt giữa chừng ⇒ AiError EMPTY. Trần token phải đi kèm hạn mức ký tự
      // ghi trong prompt (quy tắc 8) — chỉ nâng token mà để model viết dài là vẫn tràn.
      { temperature: 0, maxTokens: 8000 },
    );
  } catch (e) {
    const code = e instanceof AiError ? e.code : "UNKNOWN";
    // EMPTY = không parse được JSON; ca thực tế duy nhất gặp là output bị cắt vì biên bản quá dài.
    // Nói thẳng cho người dùng cách xử lý thay vì ném mã lỗi AI chung chung.
    if (code === "EMPTY") return { error: "AI_TOO_LONG" };
    return { error: "AI_FAILED", errorDetail: code };
  }
  const parsed = meetingParseSchema.safeParse(raw);
  if (!parsed.success) return { error: "AI_BAD_SHAPE" };

  const matched = matchParsedRows(parsed.data.rows, projects, clients);
  await prisma.auditLog.create({
    data: {
      entityType: "account_meeting",
      entityId: `${team.id}:${weekKey(weekStart)}`,
      field: "ai_parse",
      newValue: JSON.stringify({ chars: text.length, rows: matched.rows.length, unmatched: matched.unmatched.length, actions: parsed.data.actions.length, truncated }),
      action: "AI_PARSE",
      changedBy: access.meId,
    },
  });

  return {
    parsed: {
      rows: matched.rows.map((r) => ({ ...r, matchedBy: r.matchedBy })),
      actions: parsed.data.actions
        .filter((a) => a.title)
        .map((a) => ({ title: a.title, assigneeStaffId: matchAssignee(a.assigneeName, staff), assigneeName: a.assigneeName, dueDate: a.dueDate })),
      unmatched: matched.unmatched.map((u) => ({ label: [u.projectCode, u.projectName, u.clientName].filter(Boolean).join(" / ") || "(không rõ)", update: (u.update ?? "").slice(0, 200) })),
      generalNote: parsed.data.generalNote,
      truncated,
      rawMinutes: text,
    },
  };
}

export type PackState = { error?: string; markdown?: string };

/** Xuất "gói họp tuần" dạng markdown để dán vào Claude Project trước buổi họp. */
export async function buildWeeklyPack(_prev: PackState, formData: FormData): Promise<PackState> {
  const access = await requireMeetingAccess();
  const teamId = String(formData.get("teamId") ?? "");
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) return { error: "NOT_FOUND" };
  if (!canAccessTeam(access, team.id, false)) return { error: "NO_ACCESS" };
  const weekStart = parseWeekKey(String(formData.get("weekKey") ?? ""));
  if (!weekStart) return { error: "BAD_WEEK" };
  return { markdown: await buildWeeklyPackMarkdown(team.id, weekStart) };
}
