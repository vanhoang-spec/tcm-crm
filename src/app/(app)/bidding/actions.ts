"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { stringifyAudit, toNum } from "@/lib/utils";
import { getNumberSetting } from "@/lib/settings";
import { computeMarginPct, computeCostSheetTotals, computeLineAmount, flattenSectionTree, generateProjectCode, assignItemCodes, DEFAULT_COST_PREFIX } from "@/lib/bidding";
import { getStatusId } from "@/lib/project-status";
import { syncFinanceCostLines } from "@/lib/finance";
import { lockCreativeTasksForProject } from "@/lib/creative";
import { lockDepartmentTasksForProject } from "@/lib/department-tasks";
import { recomputeClientStatus } from "@/lib/client-status";
import { getMissingClientProfileFields } from "@/lib/client-profile";
import { getProjectIntakeSchema, PENDING_TEAM_ASSIGNMENT } from "@/lib/validators/project";
import { costSheetPayloadSchema } from "@/lib/validators/costsheet";
import { requirePermission, hasPermission } from "@/lib/permissions";

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
  await requirePermission("bidding.project.manage");
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
  await requirePermission("bidding.project.manage");
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
  await requirePermission("bidding.project.manage");
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
  await requirePermission("bidding.gonogo");
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
  if (decision === "NOGO") {
    await lockCreativeTasksForProject(projectId); // dự án hủy → khóa task Creative
    await lockDepartmentTasksForProject(projectId); // + khóa task Planning/PCC/OPE/PRO
  }

  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/bidding");
  revalidatePath("/creative");
  revalidatePath(`/projects/${projectId}`, "layout"); // board 4 bộ phận vừa bị khóa cascade
  revalidatePath("/reminders");
}

// ─────────────────────────────────────────────────────────
// CO/CE (cost_sheet + cost_line theo hạng mục/section) + make-up + duyệt
// ─────────────────────────────────────────────────────────

export async function saveCostSheet(
  projectId: string,
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  await requirePermission("bidding.costsheet.edit");
  const t = await getTranslations("bidding.validation");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: t("notFound") };

  // Go/No-Go gate: complex/khách mới phải GO trước khi dựng CO/CE.
  if (project.goNogoStatus === "PENDING" || project.goNogoStatus === "NOGO") {
    return { error: t("goNogoRequired") };
  }

  const scenario = String(formData.get("scenario") ?? "COST_UP");
  const vatPct = Number(formData.get("vatPct") ?? 0) || 0;
  // % phí agency trên BÁO GIÁ (form BM02) — chỉ trình bày bản xuất, không tham gia margin/tổng.
  const agencyFeePct = Number(formData.get("agencyFeePct") ?? 10) || 0;
  const mgmtFeePct = Number(formData.get("mgmtFeePct") ?? 0) || 0;
  const contingencyPct = Number(formData.get("contingencyPct") ?? 0) || 0;
  const discountPct = Number(formData.get("discountPct") ?? 0) || 0;
  const ceTotal = Number(formData.get("ceTotal") ?? 0) || 0;
  const templateId = toNullable(String(formData.get("templateId") ?? ""));
  const overrideNote = String(formData.get("overrideNote") ?? "").trim();

  const rawPayload = String(formData.get("sectionsJson") ?? "{}");
  // Lỗi validator ở đây là lỗi NGƯỜI DÙNG sửa được (thiếu tên hạng mục, dòng % nằm trong Chi hộ…)
  // nên phải nói đúng chỗ sai. Gộp chung thành "không tìm thấy dự án" khiến người dùng tưởng mất
  // dữ liệu và không biết sửa gì. JSON hỏng mới là lỗi hệ thống — giữ nguyên thông báo cũ.
  const parsed = (() => {
    try {
      return costSheetPayloadSchema.safeParse(JSON.parse(rawPayload));
    } catch {
      return null;
    }
  })();
  if (!parsed) return { error: t("notFound") };
  if (!parsed.success) return { error: t("invalidPayload", { detail: parsed.error.issues[0]?.message ?? "" }) };
  const payload = parsed.data;
  // Tính lại toàn bộ ở server — không tin số từ client. Cây section N-cấp (Mục→Nhóm→Sub-nhóm→...)
  // được làm phẳng trước (flattenSectionTree) — isProxy kế thừa từ tổ tiên, xem lib/bidding.ts.
  const sectionTree = payload.sections.map((s) => ({
    key: s.key,
    parentKey: s.parentKey ?? null,
    isProxy: s.isProxy,
    proxyFeeType: s.proxyFeeType ?? null,
    proxyFeeVal: s.proxyFeeVal ?? null,
    lines: payload.lines
      .filter((l) => l.sectionKey === s.key)
      .map((l) => ({
        lineType: l.lineType,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        fixedAmount: l.fixedAmount ?? null,
        percentVal: l.percentVal ?? null,
        taxType: l.taxType,
        customTaxAmount: l.customTaxAmount ?? null,
      })),
  }));
  const totals = computeCostSheetTotals(flattenSectionTree(sectionTree), mgmtFeePct, contingencyPct);
  const coTotal = totals.coTotal;
  const chiHo = totals.chiHo;

  // Prefix mã lấy từ phòng ban (Department.costPrefix, sửa được ở /settings/teams) — tra 1 lần
  // cho cả bảng rồi ánh xạ về từng section.
  const deptPrefixRows = await prisma.department.findMany({
    where: { costPrefix: { not: null } },
    select: { code: true, costPrefix: true },
  });
  const prefixByDept = new Map(deptPrefixRows.map((d) => [d.code, d.costPrefix!]));
  const prefixBySectionKey = new Map(
    payload.sections.map((s) => [s.key, (s.departmentCode && prefixByDept.get(s.departmentCode)) || DEFAULT_COST_PREFIX]),
  );

  const minMargin = await getNumberSetting("bidding", "min_margin_pct", 31);
  const threshold = await getNumberSetting("bidding", "auto_approve_threshold", 100_000_000);
  const marginPct = computeMarginPct(ceTotal, coTotal);
  const staffId = await getCurrentStaffId();

  // Khoá BỀN của từng dòng: nhận khoá builder gửi lên, chỉ sinh mới khi THIẾU (payload cũ) hoặc
  // TRÙNG với dòng khác trong cùng bảng. Khử trùng là bắt buộc: hai dòng cùng khoá sẽ bị
  // syncFinanceCostLines gộp làm một (Map theo lineKey) và tiền của một dòng biến mất im lặng.
  // Chốt TRƯỚC khi dựng snapshot để bản snapshot và bản ghi DB dùng chung đúng một bộ khoá.
  const usedStableKeys = new Set<string>();
  const stableKeyOfLine = new Map<(typeof payload.lines)[number], string>();
  for (const l of payload.lines) {
    const key = l.stableKey && !usedStableKeys.has(l.stableKey) ? l.stableKey : randomUUID();
    usedStableKeys.add(key);
    stableKeyOfLine.set(l, key);
  }

  // Snapshot bất biến cho CostSheetRevision (tracking version + diff từng dòng — xem lib/costsheet-diff.ts).
  // amount đã gross-up thuế (computeLineAmount) — khớp với số lưu ở CostLine.amount.
  const lineAmount = (l: (typeof payload.lines)[number]) =>
    computeLineAmount(
      { lineType: l.lineType, quantity: l.quantity, unitPrice: l.unitPrice, fixedAmount: l.fixedAmount ?? null, percentVal: l.percentVal ?? null, taxType: l.taxType, customTaxAmount: l.customTaxAmount ?? null },
      totals.directCo,
    );
  const codeByKey = new Map(payload.sections.map((s) => [s.key, s.code]));
  const snapshotJson = JSON.stringify({
    sections: payload.sections.map((s) => ({
      code: s.code,
      nameVi: s.nameVi,
      isProxy: s.isProxy,
      parentCode: s.parentKey ? (codeByKey.get(s.parentKey) ?? null) : null,
      lines: payload.lines
        .filter((l) => l.sectionKey === s.key)
        .map((l) => ({
          // Khoá bền đi vào snapshot để màn SO SÁNH khớp dòng theo nó thay vì theo (mã hạng mục +
          // tên): mã hạng mục do builder gán cứng "SECTION" nên hai dòng trùng tên ở hai hạng mục
          // khác nhau sẽ chồng lên nhau — cùng lớp lỗi đã sửa cho module ④.
          stableKey: stableKeyOfLine.get(l) ?? "",
          itemName: l.itemName,
          lineType: l.lineType,
          quantity: l.quantity,
          unit: l.unit || null,
          unitPrice: l.unitPrice,
          fixedAmount: l.fixedAmount ?? null,
          percentVal: l.percentVal ?? null,
          taxType: l.taxType,
          customTaxAmount: l.customTaxAmount ?? null,
          isSponsored: l.isSponsored,
          amount: lineAmount(l),
        })),
    })),
    totals: { coTotal, ceTotal, chiHo, marginPct: Math.round(marginPct * 100) / 100 },
  });

  // Cổng margin: dưới ngưỡng KHÔNG chặn LƯU — chỉ chặn DUYỆT.
  //
  // Trước đây người không có quyền override không lưu nổi bản dưới sàn, kể cả bản nháp đang dựng
  // dở: cả bảng bị vứt đi kèm thông báo lỗi. Với chỉ vài người giữ quyền override, đó là nút thắt
  // thật. Nay: ai cũng lưu được, nhưng bảng dưới sàn chỉ ĐƯỢC DUYỆT bởi người có
  // `bidding.margin_override` kèm lý do — bất biến "margin gate + override có lý do" giữ nguyên,
  // chỉ chuyển điểm chốt từ lúc lưu sang lúc duyệt (đúng chỗ lý do thực sự có ý nghĩa).
  let marginOverrideById: string | null = null;
  let marginOverrideNote: string | null = null;
  if (marginPct < minMargin) {
    // Giữ lý do người dựng ghi (nếu có) để người duyệt đọc, kể cả khi họ không có quyền override.
    marginOverrideNote = overrideNote || null;
    // Có quyền + có ghi lý do → tự override luôn, khỏi phải quay lại bấm Duyệt.
    if (overrideNote && (await hasPermission("bidding.margin_override"))) marginOverrideById = staffId;
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
    agencyFeePct,
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
    // 2 lượt vì section có thể lồng N-cấp (parentSectionId trỏ tới section KHÁC trong cùng payload):
    // lượt 1 tạo hết section (parentSectionId=null tạm), lượt 2 mới cập nhật lại quan hệ cha-con
    // — tránh phải sắp payload theo thứ tự tôpô cha-trước-con (không cần thiết, đơn giản hơn).
    const idByKey = new Map<string, string>();
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
          departmentCode: section.departmentCode || null,
          proxyFeeType: section.proxyFeeType ?? null,
          proxyFeeVal: section.proxyFeeVal ?? null,
        },
      });
      idByKey.set(section.key, createdSection.id);
    }
    for (const section of payload.sections) {
      if (!section.parentKey) continue;
      const parentId = idByKey.get(section.parentKey);
      if (parentId) {
        await tx.costSheetSection.update({ where: { id: idByKey.get(section.key)! }, data: { parentSectionId: parentId } });
      }
    }
    // Mã hiển thị {prefix phòng ban}-{số} — SERVER tự đánh, không nhận từ client (giá trị suy ra).
    // Đánh trên TOÀN BỘ dòng của bảng theo đúng thứ tự payload để số chạy liên tục theo prefix,
    // rồi mới tra ngược khi ghi từng section.
    const itemCodeByLineIndex = assignItemCodes(payload.lines, prefixBySectionKey);
    const codeOfLine = new Map(payload.lines.map((l, i) => [l, itemCodeByLineIndex[i]]));

    for (const section of payload.sections) {
      const sectionId = idByKey.get(section.key)!;
      const lines = payload.lines.filter((l) => l.sectionKey === section.key);
      if (lines.length > 0) {
        const percentBase = totals.directCo;
        await tx.costLine.createMany({
          data: lines.map((l, idx) => {
            const amount = computeLineAmount(
              { lineType: l.lineType, quantity: l.quantity, unitPrice: l.unitPrice, fixedAmount: l.fixedAmount ?? null, percentVal: l.percentVal ?? null, taxType: l.taxType, customTaxAmount: l.customTaxAmount ?? null },
              percentBase,
            );
            return {
              costSheetId: sheetId,
              sectionId,
              // Khoá BỀN đã chốt ở trên (nhận từ builder, khử trùng, sinh bù khi thiếu) — thứ giữ
              // liên kết tạm ứng/thanh toán sống sót qua mỗi lần xoá-tạo-lại của saveCostSheet.
              stableKey: stableKeyOfLine.get(l)!,
              itemCode: codeOfLine.get(l) ?? null,
              lineType: l.lineType,
              itemName: l.itemName,
              specs: l.specs || null,
              quantity: l.quantity,
              unit: l.unit || null,
              unitPrice: BigInt(Math.round(l.unitPrice)),
              fixedAmount: l.fixedAmount != null ? BigInt(Math.round(l.fixedAmount)) : null,
              percentVal: l.percentVal ?? null,
              taxType: l.taxType,
              customTaxAmount: l.customTaxAmount != null ? BigInt(Math.round(l.customTaxAmount)) : null,
              amount: BigInt(amount),
              vendorId: l.vendorId || null,
              isLocked: l.isLocked,
              maxMarkupPct: l.maxMarkupPct ?? null,
              isSponsored: l.isSponsored,
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

    // Ghi 1 CostSheetRevision (snapshot bất biến) — revNo tăng dần; bản đầu tiên = baseline.
    const lastRev = await tx.costSheetRevision.findFirst({
      where: { costSheetId: sheetId },
      orderBy: { revNo: "desc" },
      select: { revNo: true },
    });
    const revNo = (lastRev?.revNo ?? 0) + 1;
    await tx.costSheetRevision.create({
      data: {
        costSheetId: sheetId,
        revNo,
        isBaseline: revNo === 1,
        ceTotal: BigInt(ceTotal),
        coTotal: BigInt(coTotal),
        chiHo: BigInt(chiHo),
        marginPct: Math.round(marginPct * 100) / 100,
        note: marginOverrideNote ?? null,
        createdById: staffId,
        snapshotJson,
      },
    });
  });

  // Đồng bộ ngay xuống module ④ (Chi phí & Công nợ). CO/CE chỉ đổi được qua đúng action này nên
  // "sync khi có thay đổi" là đủ và chính xác tuyệt đối — không cần quét định kỳ toàn hệ thống.
  //
  // NGOÀI transaction và nuốt lỗi CÓ CHỦ Ý: bảng CO/CE đã lưu xong, không được để lỗi đồng bộ làm
  // hỏng cả thao tác lưu. Nếu sync hỏng thì trang Chi phí vẫn còn nút "Làm mới" và banner lệch rev.
  try {
    await syncFinanceCostLines(projectId);
  } catch (e) {
    console.error("[bidding] đồng bộ dòng chi phí thất bại sau khi lưu CO/CE:", e);
  }

  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/finance");
  revalidatePath("/reminders");
  return {};
}

/**
 * CEO duyệt cost_sheet (đường escalate — khi không auto-approve).
 *
 * ĐÂY LÀ CHỐT CHẶN CỦA MARGIN GATE: bảng dưới ngưỡng lưu được ở trạng thái chờ duyệt (xem
 * saveCostSheet), nên nếu duyệt vô điều kiện ở đây thì người có `costsheet.approve` sẽ hạ được
 * margin dưới sàn mà không cần quyền override, cũng không cần lý do. Duyệt bảng dưới sàn CHÍNH LÀ
 * override → đòi đúng quyền đó và đòi lý do (nhận lý do người dựng đã ghi nếu có).
 */
export async function approveCostSheet(
  projectId: string,
  costSheetId: string,
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  await requirePermission("bidding.costsheet.approve");
  const t = await getTranslations("bidding.validation");
  const staffId = await getCurrentStaffId();

  const sheet = await prisma.costSheet.findUnique({ where: { id: costSheetId } });
  if (!sheet) return { error: t("notFound") };

  const minMargin = await getNumberSetting("bidding", "min_margin_pct", 31);
  const marginPct = computeMarginPct(toNum(sheet.ceTotal), toNum(sheet.coTotal));
  let overrideData: { marginOverrideById: string | null; marginOverrideNote: string } | null = null;
  if (marginPct < minMargin) {
    if (!(await hasPermission("bidding.margin_override"))) {
      return { fieldErrors: { overrideNote: t("overrideNotAllowed") } };
    }
    // Lý do người duyệt vừa ghi, hoặc lý do người dựng đã ghi sẵn — duyệt tức là xác nhận lý do đó.
    const reason = String(formData.get("overrideNote") ?? "").trim() || sheet.marginOverrideNote || "";
    if (!reason) return { fieldErrors: { overrideNote: t("overrideNoteRequired") } };
    overrideData = { marginOverrideById: staffId, marginOverrideNote: reason };
  }

  await prisma.costSheet.update({
    where: { id: costSheetId },
    data: {
      approvedById: staffId,
      approvedAt: new Date(),
      rejectedById: null,
      rejectedNote: null,
      rejectedAt: null,
      ...(overrideData ?? {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      entityType: "cost_sheet",
      entityId: costSheetId,
      field: "approved",
      newValue: "true",
      action: "UPDATE",
      changedBy: staffId,
      reason: overrideData?.marginOverrideNote ?? null,
    },
  });
  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/reminders");
  return {};
}

/** CEO từ chối cost_sheet — bắt buộc lý do, báo lại PIC dự án qua Notification. */
export async function rejectCostSheet(
  projectId: string,
  costSheetId: string,
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  await requirePermission("bidding.costsheet.approve");
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
  await requirePermission("bidding.costsheet.edit");
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
  await requirePermission("bidding.contract.manage");
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

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
  if (project) await recomputeClientStatus(project.clientId, staffId);

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
  await requirePermission("bidding.status.change");
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
  await lockDepartmentTasksForProject(projectId); // + khóa task Planning/PCC/OPE/PRO
  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/bidding");
  revalidatePath("/creative");
  revalidatePath(`/projects/${projectId}`, "layout"); // board 4 bộ phận vừa bị khóa cascade
  revalidatePath("/reminders");
  return {};
}

/** "KH hủy" — khách chủ động hủy, khác với thua thầu (không cần lý do từ danh mục fail_reason). */
export async function markClientCancel(projectId: string, _formData?: FormData) {
  await requirePermission("bidding.status.change");
  const staffId = await getCurrentStaffId();
  const [before, canceledId] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { status: true } }),
    getStatusId("CANCELED"),
  ]);
  if (!before) return;

  await prisma.project.update({ where: { id: projectId }, data: { statusId: canceledId } });
  await audit(projectId, "status", before.status.code, "CANCELED", staffId, "client cancel");
  await lockCreativeTasksForProject(projectId); // KH hủy → khóa task Creative
  await lockDepartmentTasksForProject(projectId); // + khóa task Planning/PCC/OPE/PRO
  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/bidding");
  revalidatePath("/creative");
  revalidatePath(`/projects/${projectId}`, "layout"); // board 4 bộ phận vừa bị khóa cascade
  revalidatePath("/reminders");
}

/** FR-04: chỉ cho chuyển Processing khi có confirm email HOẶC PO HOẶC hợp đồng đã ký. */
export async function moveToProcessing(
  projectId: string,
  _prev?: ProjectFormState,
  _formData?: FormData,
): Promise<ProjectFormState> {
  await requirePermission("bidding.status.change");
  const t = await getTranslations("bidding.result");
  const staffId = await getCurrentStaffId();
  const [project, contract, processingId] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { status: true, client: true } }),
    prisma.contract.findUnique({ where: { projectId } }),
    getStatusId("PROCESSING"),
  ]);
  if (!project) return { error: "not found" };
  // Chỉ chuyển Processing từ trạng thái bid-phase — không "hồi sinh" dự án đã THUA/HỦY/kết thúc dù có chứng từ.
  if (!["BIDDING", "PENDING"].includes(project.status.code)) return { error: "invalid status" };

  const hasLegalDoc = !!(contract?.confirmEmailAt || contract?.poNo || contract?.signed);
  if (!hasLegalDoc) return { error: t("blockedFr04") };

  // Chặn ký hợp đồng thật khi hồ sơ khách hàng còn thiếu (MST/địa chỉ/TK NH/ngành hàng/phân loại) —
  // thường gặp với khách import từ danh sách cũ chưa được Account bổ sung đầy đủ (xem lib/client-profile.ts).
  const missingFields = getMissingClientProfileFields(project.client);
  if (missingFields.length > 0) {
    return { error: t("blockedIncompleteProfile", { fields: missingFields.map((f) => t(`profileField.${f}`)).join(", ") }) };
  }

  await prisma.project.update({ where: { id: projectId }, data: { statusId: processingId, processingAt: new Date() } });
  await audit(projectId, "status", project.status.code, "PROCESSING", staffId, "move to processing");

  // Dựng dòng chi phí NGAY khi vào thực thi: từ đây dự án mới được tạm ứng/thanh toán, mà mỗi dòng
  // chi phí chính là TRẦN CHI. Bảng CO/CE lưu qua saveCostSheet đã tự đồng bộ, nhưng bảng nhập thẳng
  // vào DB (seed/nhập liệu) thì chưa — không có bước này, dự án vào thực thi với 0 đối tượng trần chi
  // cho tới khi có người nhớ bấm "Làm mới".
  // Nuốt lỗi có chủ ý như ở saveCostSheet: đã đổi trạng thái rồi, lỗi đồng bộ không được làm hỏng
  // thao tác; trang Chi phí vẫn còn nút "Làm mới" nếu bước này trượt.
  try {
    await syncFinanceCostLines(projectId);
  } catch (e) {
    console.error("[bidding] đồng bộ dòng chi phí thất bại khi vào Processing:", e);
  }

  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/bidding");
  revalidatePath("/finance");
  revalidatePath("/reminders"); // vào Processing → xuất hiện trong nhắc việc thực thi
  return {};
}

// ─────────────────────────────────────────────────────────
// Xác nhận Kế toán + Liquidation/Finished
// ─────────────────────────────────────────────────────────

/** Kế toán xác nhận "Hợp đồng đã xong" — dừng nhắc việc Processing. */
export async function confirmContractDone(projectId: string) {
  await requirePermission("bidding.contract.manage");
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
  await requirePermission("bidding.status.change");
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
  await requirePermission("bidding.status.change");
  const t = await getTranslations("bidding.result");
  const staffId = await getCurrentStaffId();
  const [project, contract, liquidationId] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { status: true } }),
    prisma.contract.findUnique({ where: { projectId } }),
    getStatusId("LIQUIDATION"),
  ]);
  if (!project) return { error: "not found" };
  // Chỉ từ PROCESSING — không "hồi sinh" dự án đã THUA/HỦY (dù contract từng được xác nhận).
  if (project.status.code !== "PROCESSING") return { error: "invalid status" };
  if (!contract?.accountantConfirmedAt) return { error: t("blockedNeedContractDone") };

  await prisma.project.update({ where: { id: projectId }, data: { statusId: liquidationId, liquidationAt: new Date() } });
  await audit(projectId, "status", project.status.code, "LIQUIDATION", staffId, "move to liquidation");
  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/bidding");
  revalidatePath("/reminders"); // đổi status ảnh hưởng getBiddingReminders/getTimelineOverdueItems
  return {};
}

/**
 * Liquidation → Finished. Cần Kế toán đã xác nhận "Đã nhận đủ hồ sơ nghiệm thu" (FR-02/06)
 * VÀ dự án đã phát hành ít nhất một hóa đơn.
 *
 * Điều kiện hóa đơn là bất biến #4 trong HANDOVER mục 6 nhưng trước đây KHÔNG được thực thi: dự án
 * đóng sổ được khi khách chưa nhận hóa đơn nào, tiền coi như bốc hơi khỏi tầm ngắm. Cố ý chỉ đòi
 * ĐÃ PHÁT HÀNH chứ không đòi thu đủ — khoản giữ lại 5–10% bảo hành là bình thường trong nghề, đòi
 * thu sạch sẽ khiến dự án nằm mãi ở Nghiệm thu.
 */
export async function markFinished(
  projectId: string,
  _prev?: ProjectFormState,
  _formData?: FormData,
): Promise<ProjectFormState> {
  await requirePermission("bidding.status.change");
  const t = await getTranslations("bidding.result");
  const staffId = await getCurrentStaffId();
  const [project, contract, invoiceCount, finishedId] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { status: true } }),
    prisma.contract.findUnique({ where: { projectId } }),
    prisma.clientInvoice.count({ where: { projectId, voidedAt: null } }),
    getStatusId("FINISHED"),
  ]);
  if (!project) return { error: "not found" };
  // Chỉ từ LIQUIDATION — FINISHED sai đường sẽ mở lại grace 7 ngày cho task đã khóa.
  if (project.status.code !== "LIQUIDATION") return { error: "invalid status" };
  if (!contract?.acceptanceDocsConfirmedAt) return { error: t("blockedNeedAcceptanceDocs") };
  if (invoiceCount === 0) return { error: t("blockedNeedInvoice") };

  await prisma.project.update({ where: { id: projectId }, data: { statusId: finishedId, finishedAt: new Date() } });
  await audit(projectId, "status", project.status.code, "FINISHED", staffId, "mark finished");
  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/bidding");
  revalidatePath("/creative"); // FINISHED mở cửa sổ grace 7 ngày cho task Creative — cập nhật đếm ngược/khóa
  revalidatePath("/reminders"); // rơi khỏi getBiddingReminders/getTimelineOverdueItems
  return {};
}
