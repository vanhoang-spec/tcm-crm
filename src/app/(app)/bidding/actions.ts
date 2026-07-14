"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { stringifyAudit } from "@/lib/utils";
import { getNumberSetting } from "@/lib/settings";
import { computeMarginPct, computeCostSheetTotals, generateProjectCode } from "@/lib/bidding";
import { getStatusId } from "@/lib/project-status";
import { lockCreativeTasksForProject } from "@/lib/creative";
import { getProjectIntakeSchema, PENDING_TEAM_ASSIGNMENT } from "@/lib/validators/project";
import { costSheetPayloadSchema } from "@/lib/validators/costsheet";

export type ProjectFormState = { error?: string; fieldErrors?: Record<string, string> };

function toNullable(v: string) {
  return v.trim() === "" ? null : v.trim();
}

async function audit(
  entityId: string,
  field: string,
  oldValue: string | null,
  newValue: string | null,
  staffId: string | null,
  reason?: string,
) {
  await prisma.auditLog.create({
    data: { entityType: "project", entityId, field, oldValue, newValue, action: "UPDATE", changedBy: staffId, reason },
  });
}

/** Sentinel "Đợi BGĐ giao team Account" → ownerTeamId lưu null. */
function resolveOwnerTeamId(ownerTeamId: string) {
  return ownerTeamId === PENDING_TEAM_ASSIGNMENT ? null : ownerTeamId;
}

async function notifyTeamAssignmentNeeded(projectId: string, projectCode: string, projectName: string) {
  const recipients = await prisma.staff.findMany({ where: { title: { in: ["CEO", "BD Director"] } } });
  if (recipients.length === 0) return;
  await prisma.notification.createMany({
    data: recipients.map((r) => ({
      recipientStaffId: r.id,
      type: "TEAM_ASSIGNMENT_NEEDED",
      title: `Dự án ${projectCode} chờ giao team Account`,
      body: projectName,
      projectId,
    })),
  });
}

// ─────────────────────────────────────────────────────────
// Tiếp nhận / sửa dự án
// ─────────────────────────────────────────────────────────

export async function createProject(_prev: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const t = await getTranslations("bidding.validation");
  const parsed = getProjectIntakeSchema(t).safeParse({
    name: String(formData.get("name") ?? ""),
    clientId: String(formData.get("clientId") ?? ""),
    ownerTeamId: String(formData.get("ownerTeamId") ?? ""),
    ownerId: String(formData.get("ownerId") ?? ""),
    briefLinkUrl: String(formData.get("briefLinkUrl") ?? ""),
    projectTypeId: String(formData.get("projectTypeId") ?? ""),
    complexityId: String(formData.get("complexityId") ?? ""),
    budget: formData.get("budget") ? Number(formData.get("budget")) : undefined,
    channelId: String(formData.get("channelId") ?? ""),
    scope: String(formData.get("scope") ?? ""),
    venue: String(formData.get("venue") ?? ""),
  });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0] ?? "form")] ??= i.message;
    return { fieldErrors: fe };
  }
  const d = parsed.data;
  const ownerTeamId = resolveOwnerTeamId(d.ownerTeamId);

  const [client, team, complexity] = await Promise.all([
    prisma.client.findUnique({ where: { id: d.clientId } }),
    ownerTeamId ? prisma.team.findUnique({ where: { id: ownerTeamId } }) : null,
    prisma.optionItem.findUnique({ where: { id: d.complexityId } }),
  ]);
  if (!client || !complexity || (ownerTeamId && !team)) return { error: t("notFound") };

  const fiscalYear = new Date().getFullYear();
  const code = await generateProjectCode(prisma, client.code, team?.code ?? "XX", fiscalYear);
  const staffId = await getCurrentStaffId();
  const [statusId] = await Promise.all([getStatusId("BIDDING")]);

  // Go/No-Go bắt buộc khi complex HOẶC khách mới → khởi tạo PENDING; ngược lại bỏ qua.
  const needsGoNogo = complexity.code === "COMPLEX" || client.isNew;

  const project = await prisma.project.create({
    data: {
      code,
      name: d.name,
      clientId: d.clientId,
      ownerTeamId,
      ownerId: toNullable(d.ownerId ?? ""),
      statusId,
      briefLinkUrl: d.briefLinkUrl,
      projectTypeId: d.projectTypeId,
      complexityId: d.complexityId,
      goNogoStatus: needsGoNogo ? "PENDING" : null,
      budget: d.budget != null ? BigInt(d.budget) : null,
      channelId: toNullable(d.channelId ?? ""),
      scope: toNullable(d.scope ?? ""),
      venue: toNullable(d.venue ?? ""),
      fiscalYear,
    },
  });

  if (!ownerTeamId) await notifyTeamAssignmentNeeded(project.id, project.code, project.name);

  await prisma.auditLog.create({
    data: {
      entityType: "project",
      entityId: project.id,
      field: "*",
      newValue: stringifyAudit({ ...d, code }),
      action: "CREATE",
      changedBy: staffId,
    },
  });

  revalidatePath("/bidding");
  redirect(`/bidding/${project.id}`);
}

export async function updateProject(
  projectId: string,
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const t = await getTranslations("bidding.validation");
  const parsed = getProjectIntakeSchema(t).safeParse({
    name: String(formData.get("name") ?? ""),
    clientId: String(formData.get("clientId") ?? ""),
    ownerTeamId: String(formData.get("ownerTeamId") ?? ""),
    ownerId: String(formData.get("ownerId") ?? ""),
    briefLinkUrl: String(formData.get("briefLinkUrl") ?? ""),
    projectTypeId: String(formData.get("projectTypeId") ?? ""),
    complexityId: String(formData.get("complexityId") ?? ""),
    budget: formData.get("budget") ? Number(formData.get("budget")) : undefined,
    channelId: String(formData.get("channelId") ?? ""),
    scope: String(formData.get("scope") ?? ""),
    venue: String(formData.get("venue") ?? ""),
  });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0] ?? "form")] ??= i.message;
    return { fieldErrors: fe };
  }
  const d = parsed.data;
  const staffId = await getCurrentStaffId();
  const before = await prisma.project.findUnique({ where: { id: projectId } });
  if (!before) return { error: t("notFound") };
  const ownerTeamId = resolveOwnerTeamId(d.ownerTeamId);

  await prisma.project.update({
    where: { id: projectId },
    data: {
      name: d.name,
      clientId: d.clientId,
      ownerTeamId,
      ownerId: toNullable(d.ownerId ?? ""),
      briefLinkUrl: d.briefLinkUrl,
      projectTypeId: d.projectTypeId,
      complexityId: d.complexityId,
      budget: d.budget != null ? BigInt(d.budget) : null,
      channelId: toNullable(d.channelId ?? ""),
      scope: toNullable(d.scope ?? ""),
      venue: toNullable(d.venue ?? ""),
    },
  });
  if (!before.ownerTeamId && ownerTeamId) {
    await prisma.notification.updateMany({
      where: { projectId, type: "TEAM_ASSIGNMENT_NEEDED", isRead: false },
      data: { isRead: true },
    });
  } else if (!ownerTeamId && before.ownerTeamId) {
    await notifyTeamAssignmentNeeded(projectId, before.code, d.name);
  }
  await audit(projectId, "*", null, stringifyAudit(d), staffId, "update intake");

  revalidatePath("/bidding");
  revalidatePath(`/bidding/${projectId}`);
  redirect(`/bidding/${projectId}`);
}

/** BGĐ chọn team Account phụ trách cho dự án đang "Đợi BGĐ giao team Account". */
export async function assignProjectTeam(projectId: string, formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "").trim();
  if (!teamId) return;
  const staffId = await getCurrentStaffId();

  await prisma.$transaction([
    prisma.project.update({ where: { id: projectId }, data: { ownerTeamId: teamId } }),
    prisma.notification.updateMany({
      where: { projectId, type: "TEAM_ASSIGNMENT_NEEDED", isRead: false },
      data: { isRead: true },
    }),
    prisma.auditLog.create({
      data: {
        entityType: "project",
        entityId: projectId,
        field: "ownerTeamId",
        oldValue: null,
        newValue: teamId,
        action: "UPDATE",
        changedBy: staffId,
        reason: "assign team",
      },
    }),
  ]);

  revalidatePath("/bidding");
  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/reminders");
}

// ─────────────────────────────────────────────────────────
// Go / No-Go
// ─────────────────────────────────────────────────────────

export async function decideGoNogo(projectId: string, formData: FormData) {
  const decision = String(formData.get("decision") ?? ""); // GO | NOGO
  const note = String(formData.get("note") ?? "").trim();
  if (decision !== "GO" && decision !== "NOGO") return;

  const staffId = await getCurrentStaffId();
  const before = await prisma.project.findUnique({ where: { id: projectId } });
  if (!before) return;

  const canceledId = decision === "NOGO" ? await getStatusId("CANCELED") : null;

  await prisma.project.update({
    where: { id: projectId },
    data: {
      goNogoStatus: decision,
      goNogoNote: note || null,
      goNogoById: staffId,
      goNogoAt: new Date(),
      // NO-GO → hủy dự án luôn (không theo đuổi)
      statusId: canceledId ?? before.statusId,
    },
  });
  await audit(projectId, "goNogoStatus", before.goNogoStatus, decision, staffId, note || undefined);
  if (decision === "NOGO") await lockCreativeTasksForProject(projectId); // dự án hủy → khóa task Creative

  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/bidding");
  revalidatePath("/creative");
}

// ─────────────────────────────────────────────────────────
// CO/CE (cost_sheet + cost_line theo hạng mục/section) + make-up + duyệt
// ─────────────────────────────────────────────────────────

export async function saveCostSheet(
  projectId: string,
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const t = await getTranslations("bidding.validation");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: t("notFound") };

  // Go/No-Go gate: complex/khách mới phải GO trước khi dựng CO/CE.
  if (project.goNogoStatus === "PENDING" || project.goNogoStatus === "NOGO") {
    return { error: t("goNogoRequired") };
  }

  const scenario = String(formData.get("scenario") ?? "COST_UP");
  const vatPct = Number(formData.get("vatPct") ?? 0) || 0;
  const mgmtFeePct = Number(formData.get("mgmtFeePct") ?? 0) || 0;
  const contingencyPct = Number(formData.get("contingencyPct") ?? 0) || 0;
  const discountPct = Number(formData.get("discountPct") ?? 0) || 0;
  const ceTotal = Number(formData.get("ceTotal") ?? 0) || 0;
  const templateId = toNullable(String(formData.get("templateId") ?? ""));
  const overrideNote = String(formData.get("overrideNote") ?? "").trim();

  const rawPayload = String(formData.get("sectionsJson") ?? "{}");
  let payload;
  try {
    payload = costSheetPayloadSchema.parse(JSON.parse(rawPayload));
  } catch {
    return { error: t("notFound") };
  }
  // Tính lại toàn bộ ở server — không tin số từ client.
  const sectionsForCalc = payload.sections.map((s) => ({
    isProxy: s.isProxy,
    proxyFeeType: s.proxyFeeType,
    proxyFeeVal: s.proxyFeeVal,
    lines: payload.lines
      .filter((l) => l.sectionKey === s.key)
      .map((l) => ({
        lineType: l.lineType,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        fixedAmount: l.fixedAmount ?? null,
        percentVal: l.percentVal ?? null,
      })),
  }));
  const totals = computeCostSheetTotals(sectionsForCalc, mgmtFeePct, contingencyPct);
  const coTotal = totals.coTotal;
  const chiHo = totals.chiHo;

  const minMargin = await getNumberSetting("bidding", "min_margin_pct", 31);
  const threshold = await getNumberSetting("bidding", "auto_approve_threshold", 100_000_000);
  const marginPct = computeMarginPct(ceTotal, coTotal);
  const staffId = await getCurrentStaffId();

  // Cổng margin: dưới ngưỡng → bắt buộc override có lý do.
  let marginOverrideById: string | null = null;
  let marginOverrideNote: string | null = null;
  if (marginPct < minMargin) {
    if (!overrideNote) return { fieldErrors: { overrideNote: t("overrideNoteRequired") } };
    marginOverrideById = staffId;
    marginOverrideNote = overrideNote;
  }

  // Duyệt theo ngưỡng (FR-12): margin đạt + dưới ngưỡng giá trị + không phải budget-down → auto-approve.
  // Margin override → coi như CEO đã duyệt. Còn lại → chờ duyệt (approvedBy null).
  const autoApprove = marginPct >= minMargin && ceTotal < threshold && scenario !== "BUDGET_DOWN";
  const approvedNow = autoApprove || marginOverrideById != null;

  const existing = await prisma.costSheet.findFirst({
    where: { projectId, version: "CTRACT" },
    orderBy: { createdAt: "desc" },
  });

  const sheetData = {
    scenario,
    templateId,
    ceTotal: BigInt(ceTotal),
    coTotal: BigInt(coTotal),
    chiHo: BigInt(chiHo),
    vatPct,
    mgmtFeePct,
    contingencyPct,
    discountPct,
    minMarginPct: minMargin,
    marginOverrideById,
    marginOverrideNote,
    approvedById: approvedNow ? staffId : null,
    approvedAt: approvedNow ? new Date() : null,
    rejectedById: null,
    rejectedNote: null,
    rejectedAt: null,
  };

  await prisma.$transaction(async (tx) => {
    let sheetId: string;
    if (existing) {
      await tx.costSheet.update({ where: { id: existing.id }, data: sheetData });
      await tx.costSheetSection.deleteMany({ where: { costSheetId: existing.id } });
      sheetId = existing.id;
    } else {
      const created = await tx.costSheet.create({ data: { projectId, version: "CTRACT", ...sheetData } });
      sheetId = created.id;
    }
    for (const [si, section] of payload.sections.entries()) {
      const createdSection = await tx.costSheetSection.create({
        data: {
          costSheetId: sheetId,
          code: section.code,
          icon: section.icon || null,
          nameVi: section.nameVi,
          nameEn: section.nameEn || null,
          colorSlot: section.colorSlot || null,
          sort: si,
          isProxy: section.isProxy,
          proxyFeeType: section.proxyFeeType ?? null,
          proxyFeeVal: section.proxyFeeVal ?? null,
        },
      });
      const lines = payload.lines.filter((l) => l.sectionKey === section.key);
      if (lines.length > 0) {
        const percentBase = totals.directCo;
        await tx.costLine.createMany({
          data: lines.map((l, idx) => {
            const amount =
              l.lineType === "FIXED"
                ? Math.round(l.fixedAmount ?? 0)
                : l.lineType === "PERCENT_OF_TOTAL"
                  ? Math.round(((l.percentVal ?? 0) / 100) * percentBase)
                  : Math.round(l.quantity * l.unitPrice);
            return {
              costSheetId: sheetId,
              sectionId: createdSection.id,
              lineType: l.lineType,
              itemName: l.itemName,
              specs: l.specs || null,
              quantity: l.quantity,
              unit: l.unit || null,
              unitPrice: BigInt(l.unitPrice),
              fixedAmount: l.fixedAmount != null ? BigInt(l.fixedAmount) : null,
              percentVal: l.percentVal ?? null,
              amount: BigInt(amount),
              vendorId: l.vendorId || null,
              isLocked: l.isLocked,
              maxMarkupPct: l.maxMarkupPct ?? null,
              sort: idx,
              note: l.note || null,
            };
          }),
        });
      }
    }
    await tx.auditLog.create({
      data: {
        entityType: "cost_sheet",
        entityId: sheetId,
        field: "totals",
        newValue: stringifyAudit({ coTotal, ceTotal, chiHo, marginPct: Math.round(marginPct * 100) / 100, approvedNow }),
        action: existing ? "UPDATE" : "CREATE",
        changedBy: staffId,
        reason: marginOverrideNote ?? undefined,
      },
    });
  });

  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/reminders");
  return {};
}

/** CEO duyệt cost_sheet (đường escalate — khi không auto-approve). */
export async function approveCostSheet(projectId: string, costSheetId: string, _formData?: FormData) {
  const staffId = await getCurrentStaffId();
  await prisma.costSheet.update({
    where: { id: costSheetId },
    data: { approvedById: staffId, approvedAt: new Date(), rejectedById: null, rejectedNote: null, rejectedAt: null },
  });
  await prisma.auditLog.create({
    data: { entityType: "cost_sheet", entityId: costSheetId, field: "approved", newValue: "true", action: "UPDATE", changedBy: staffId },
  });
  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/reminders");
}

/** CEO từ chối cost_sheet — bắt buộc lý do, báo lại PIC dự án qua Notification. */
export async function rejectCostSheet(
  projectId: string,
  costSheetId: string,
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const t = await getTranslations("bidding.costsheet");
  const note = String(formData.get("rejectNote") ?? "").trim();
  if (!note) return { fieldErrors: { rejectNote: t("rejectNoteRequired") } };

  const staffId = await getCurrentStaffId();
  const project = await prisma.project.findUnique({ where: { id: projectId } });

  await prisma.$transaction([
    prisma.costSheet.update({
      where: { id: costSheetId },
      data: { rejectedById: staffId, rejectedNote: note, rejectedAt: new Date(), approvedById: null, approvedAt: null },
    }),
    prisma.auditLog.create({
      data: { entityType: "cost_sheet", entityId: costSheetId, field: "rejected", newValue: "true", action: "UPDATE", changedBy: staffId, reason: note },
    }),
    ...(project?.ownerId
      ? [
          prisma.notification.create({
            data: {
              recipientStaffId: project.ownerId,
              type: "COSTSHEET_REJECTED",
              title: `CO/CE dự án ${project.code} bị từ chối`,
              body: note,
              projectId,
            },
          }),
        ]
      : []),
  ]);

  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/reminders");
  return {};
}

// ─────────────────────────────────────────────────────────
// Vòng deal giá
// ─────────────────────────────────────────────────────────

export async function addBiddingRound(projectId: string, formData: FormData) {
  const clientFeedback = String(formData.get("clientFeedback") ?? "").trim();
  const revisedCeRaw = String(formData.get("revisedCe") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "ongoing");
  const note = String(formData.get("note") ?? "").trim();
  const staffId = await getCurrentStaffId();

  const count = await prisma.biddingRound.count({ where: { projectId } });
  await prisma.biddingRound.create({
    data: {
      projectId,
      roundNo: count + 1,
      clientFeedback: clientFeedback || null,
      revisedCe: revisedCeRaw === "" ? null : BigInt(Number(revisedCeRaw) || 0),
      outcome: ["ongoing", "accepted", "rejected"].includes(outcome) ? outcome : "ongoing",
      note: note || null,
      createdById: staffId,
    },
  });
  revalidatePath(`/bidding/${projectId}`);
}

// ─────────────────────────────────────────────────────────
// Hợp đồng
// ─────────────────────────────────────────────────────────

export async function saveContract(projectId: string, formData: FormData) {
  const staffId = await getCurrentStaffId();
  const data = {
    contractNo: toNullable(String(formData.get("contractNo") ?? "")),
    poNo: toNullable(String(formData.get("poNo") ?? "")),
    paymentTermDays: formData.get("paymentTermDays") ? Number(formData.get("paymentTermDays")) : null,
    templateSource: toNullable(String(formData.get("templateSource") ?? "")),
    signed: formData.get("signed") === "on",
    contractDate: formData.get("contractDate") ? new Date(String(formData.get("contractDate"))) : null,
    poDate: formData.get("poDate") ? new Date(String(formData.get("poDate"))) : null,
    confirmEmailAt: formData.get("confirmEmail") === "on" ? new Date() : null,
    note: toNullable(String(formData.get("note") ?? "")),
  };

  const existing = await prisma.contract.findUnique({ where: { projectId } });
  // Giữ mốc confirmEmailAt cũ nếu đã set và lần này không tick lại
  const confirmEmailAt = data.confirmEmailAt ?? existing?.confirmEmailAt ?? null;

  await prisma.contract.upsert({
    where: { projectId },
    update: { ...data, confirmEmailAt },
    create: { projectId, ...data, confirmEmailAt },
  });
  await prisma.auditLog.create({
    data: { entityType: "contract", entityId: projectId, field: "*", newValue: stringifyAudit(data), action: existing ? "UPDATE" : "CREATE", changedBy: staffId },
  });
  revalidatePath(`/bidding/${projectId}`);
}

// ─────────────────────────────────────────────────────────
// Kết quả thầu & bàn giao
// ─────────────────────────────────────────────────────────

export async function markFailed(
  projectId: string,
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const t = await getTranslations("bidding.validation");
  const failReasonId = String(formData.get("failReasonId") ?? "").trim();
  const failReasonNote = String(formData.get("failReasonNote") ?? "").trim();
  if (!failReasonId) return { fieldErrors: { failReasonId: t("failReasonRequired") } };

  const failReason = await prisma.optionItem.findUnique({ where: { id: failReasonId } });
  if (failReason?.code === "OTHER" && !failReasonNote) {
    return { fieldErrors: { failReasonNote: t("failReasonNoteRequired") } };
  }

  const staffId = await getCurrentStaffId();
  const [before, failedId] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { status: true } }),
    getStatusId("FAILED"),
  ]);
  await prisma.project.update({
    where: { id: projectId },
    data: { statusId: failedId, failReasonId, failReasonNote: failReasonNote || null },
  });
  await audit(projectId, "status", before?.status.code ?? null, "FAILED", staffId, failReasonNote || undefined);
  await lockCreativeTasksForProject(projectId); // thua thầu → khóa task Creative
  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/bidding");
  revalidatePath("/creative");
  return {};
}

/** "KH hủy" — khách chủ động hủy, khác với thua thầu (không cần lý do từ danh mục fail_reason). */
export async function markClientCancel(projectId: string, _formData?: FormData) {
  const staffId = await getCurrentStaffId();
  const [before, canceledId] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { status: true } }),
    getStatusId("CANCELED"),
  ]);
  if (!before) return;

  await prisma.project.update({ where: { id: projectId }, data: { statusId: canceledId } });
  await audit(projectId, "status", before.status.code, "CANCELED", staffId, "client cancel");
  await lockCreativeTasksForProject(projectId); // KH hủy → khóa task Creative
  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/bidding");
  revalidatePath("/creative");
}

/** FR-04: chỉ cho chuyển Processing khi có confirm email HOẶC PO HOẶC hợp đồng đã ký. */
export async function moveToProcessing(
  projectId: string,
  _prev?: ProjectFormState,
  _formData?: FormData,
): Promise<ProjectFormState> {
  const t = await getTranslations("bidding.result");
  const staffId = await getCurrentStaffId();
  const [project, contract, processingId] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { status: true } }),
    prisma.contract.findUnique({ where: { projectId } }),
    getStatusId("PROCESSING"),
  ]);
  if (!project) return { error: "not found" };

  const hasLegalDoc = !!(contract?.confirmEmailAt || contract?.poNo || contract?.signed);
  if (!hasLegalDoc) return { error: t("blockedFr04") };

  await prisma.project.update({ where: { id: projectId }, data: { statusId: processingId, processingAt: new Date() } });
  await audit(projectId, "status", project.status.code, "PROCESSING", staffId, "move to processing");
  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/bidding");
  return {};
}

// ─────────────────────────────────────────────────────────
// Xác nhận Kế toán + Liquidation/Finished
// ─────────────────────────────────────────────────────────

/** Kế toán xác nhận "Hợp đồng đã xong" — dừng nhắc việc Processing. */
export async function confirmContractDone(projectId: string) {
  const staffId = await getCurrentStaffId();
  const contract = await prisma.contract.findUnique({ where: { projectId } });
  if (!contract) return;

  await prisma.contract.update({
    where: { projectId },
    data: { accountantConfirmedAt: new Date(), accountantConfirmedById: staffId },
  });
  await prisma.auditLog.create({
    data: {
      entityType: "contract",
      entityId: projectId,
      field: "accountantConfirmedAt",
      newValue: new Date().toISOString(),
      action: "UPDATE",
      changedBy: staffId,
      reason: "accountant confirmed contract done",
    },
  });
  revalidatePath(`/bidding/${projectId}`);
}

/** Kế toán xác nhận "Đã nhận đủ hồ sơ nghiệm thu" — dừng nhắc việc Liquidation. */
export async function confirmAcceptanceDocs(projectId: string) {
  const staffId = await getCurrentStaffId();
  const contract = await prisma.contract.findUnique({ where: { projectId } });
  if (!contract) return;

  await prisma.contract.update({
    where: { projectId },
    data: { acceptanceDocsConfirmedAt: new Date(), acceptanceDocsConfirmedById: staffId },
  });
  await prisma.auditLog.create({
    data: {
      entityType: "contract",
      entityId: projectId,
      field: "acceptanceDocsConfirmedAt",
      newValue: new Date().toISOString(),
      action: "UPDATE",
      changedBy: staffId,
      reason: "accountant confirmed acceptance docs",
    },
  });
  revalidatePath(`/bidding/${projectId}`);
}

/** Processing → Liquidation. Cần Kế toán đã xác nhận "Hợp đồng đã xong". */
export async function moveToLiquidation(
  projectId: string,
  _prev?: ProjectFormState,
  _formData?: FormData,
): Promise<ProjectFormState> {
  const t = await getTranslations("bidding.result");
  const staffId = await getCurrentStaffId();
  const [project, contract, liquidationId] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { status: true } }),
    prisma.contract.findUnique({ where: { projectId } }),
    getStatusId("LIQUIDATION"),
  ]);
  if (!project) return { error: "not found" };
  if (!contract?.accountantConfirmedAt) return { error: t("blockedNeedContractDone") };

  await prisma.project.update({ where: { id: projectId }, data: { statusId: liquidationId, liquidationAt: new Date() } });
  await audit(projectId, "status", project.status.code, "LIQUIDATION", staffId, "move to liquidation");
  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/bidding");
  return {};
}

/** Liquidation → Finished. Cần Kế toán đã xác nhận "Đã nhận đủ hồ sơ nghiệm thu" (FR-02/06). */
export async function markFinished(
  projectId: string,
  _prev?: ProjectFormState,
  _formData?: FormData,
): Promise<ProjectFormState> {
  const t = await getTranslations("bidding.result");
  const staffId = await getCurrentStaffId();
  const [project, contract, finishedId] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { status: true } }),
    prisma.contract.findUnique({ where: { projectId } }),
    getStatusId("FINISHED"),
  ]);
  if (!project) return { error: "not found" };
  if (!contract?.acceptanceDocsConfirmedAt) return { error: t("blockedNeedAcceptanceDocs") };

  await prisma.project.update({ where: { id: projectId }, data: { statusId: finishedId, finishedAt: new Date() } });
  await audit(projectId, "status", project.status.code, "FINISHED", staffId, "mark finished");
  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/bidding");
  return {};
}
