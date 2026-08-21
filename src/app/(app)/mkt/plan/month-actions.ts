"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { AiError, aiChatJson, isAiConfigured } from "@/lib/ai/deepseek";
import { mktMonthSuggestPrompt } from "@/lib/ai/mkt-prompts";
import {
  MAX_MKT_KEY_POINTS,
  MAX_MKT_NOTE,
  MAX_MKT_TITLE,
  channelsToCsv,
  mktMonthSuggestSchema,
  mondaysInMonth,
  monthKey,
  parseMonthKey,
  weekKey,
} from "@/lib/mkt";

/**
 * MKT-3 — KẾ HOẠCH THÁNG: tạo / AI đề xuất / duyệt.
 *
 * ⚠ DUYỆT THÁNG là CỔNG NGƯỜI GIỮ của cả luồng tự động: chỉ khi duyệt xong thì các dòng tuần mới
 * được đóng dấu `approvedAt` và job mới dựng bài. AI đề xuất mà chưa ai đọc thì nằm im mãi.
 * ⚠ AI trả về TRỰC TIẾP VÀO DB ở đây (khác panel tuần của 2a) — nhưng vào bản NHÁP chưa duyệt, nên
 * vẫn đúng nguyên tắc "AI không tự sinh ra bài đăng": HR đọc bản nháp, sửa, rồi mới bấm Duyệt.
 */

export type MonthState = { error?: string; aiError?: string; success?: boolean; monthKey?: string };

const str = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

async function audit(entityId: string, action: string, payload: unknown) {
  await prisma.auditLog.create({
    data: { entityType: "mkt_month", entityId, field: "*", action, newValue: JSON.stringify(payload), changedBy: await getCurrentStaffId() },
  });
}

/** Tạo hoặc sửa kế hoạch tháng (chủ đề / định hướng / ghi chú). */
export async function saveMonthPlan(_prev: MonthState, formData: FormData): Promise<MonthState> {
  await requirePermission("mkt.review");
  const month = parseMonthKey(str(formData.get("month"), 7));
  if (!month) return { error: "BAD_MONTH" };
  const theme = str(formData.get("theme"), MAX_MKT_TITLE);
  if (!theme) return { error: "NO_THEME" };
  const data = { theme, goals: str(formData.get("goals"), MAX_MKT_KEY_POINTS), note: str(formData.get("note"), MAX_MKT_NOTE) || null };

  const existing = await prisma.mktMonthPlan.findUnique({ where: { month }, select: { id: true, status: true } });
  if (existing) {
    // Tháng đã duyệt vẫn sửa được chủ đề/ghi chú (không đụng các dòng bài) — đây là siêu dữ liệu,
    // không phải nội dung đã chốt.
    await prisma.mktMonthPlan.update({ where: { id: existing.id }, data });
  } else {
    await prisma.mktMonthPlan.create({ data: { month, ...data, createdById: await getCurrentStaffId() } });
  }
  await audit(monthKey(month), existing ? "UPDATE" : "CREATE", { theme });
  revalidatePath("/mkt/plan");
  return { success: true, monthKey: monthKey(month) };
}

/**
 * DUYỆT kế hoạch tháng → đóng dấu duyệt cho MỌI dòng tuần thuộc tháng (trừ dòng đã bỏ qua / đã dựng).
 *
 * ⚠ Đóng dấu trên TỪNG DÒNG chứ không chỉ trên tháng: job dựng bài đọc `MktPlanItem.approvedAt`, và
 * dòng thêm vào SAU khi duyệt tháng phải tự chịu bước duyệt riêng chứ không được ăn theo.
 */
export async function approveMonthPlan(monthKeyStr: string, _prev: MonthState, _formData: FormData): Promise<MonthState> {
  await requirePermission("mkt.review");
  const month = parseMonthKey(monthKeyStr);
  if (!month) return { error: "BAD_MONTH" };
  const plan = await prisma.mktMonthPlan.findUnique({ where: { month }, select: { id: true, status: true, _count: { select: { items: true } } } });
  if (!plan) return { error: "NOT_FOUND" };
  if (plan.status === "APPROVED") return { error: "ALREADY_APPROVED" };
  if (plan._count.items === 0) return { error: "NO_ITEMS" };

  const staffId = await getCurrentStaffId();
  const now = new Date();
  const [, marked] = await prisma.$transaction([
    prisma.mktMonthPlan.update({ where: { id: plan.id }, data: { status: "APPROVED", approvedAt: now, approvedById: staffId } }),
    prisma.mktPlanItem.updateMany({ where: { monthPlanId: plan.id, status: "PLANNED", approvedAt: null }, data: { approvedAt: now, approvedById: staffId } }),
  ]);
  await audit(monthKeyStr, "APPROVE", { items: marked.count });
  revalidatePath("/mkt/plan");
  return { success: true };
}

/** Mở lại tháng đã duyệt để sửa — gỡ dấu duyệt của các dòng CHƯA dựng bài (dòng đã dựng giữ nguyên). */
export async function reopenMonthPlan(monthKeyStr: string, _prev: MonthState, _formData: FormData): Promise<MonthState> {
  await requirePermission("mkt.review");
  const month = parseMonthKey(monthKeyStr);
  if (!month) return { error: "BAD_MONTH" };
  const plan = await prisma.mktMonthPlan.findUnique({ where: { month }, select: { id: true } });
  if (!plan) return { error: "NOT_FOUND" };
  await prisma.$transaction([
    prisma.mktMonthPlan.update({ where: { id: plan.id }, data: { status: "DRAFT", approvedAt: null, approvedById: null } }),
    prisma.mktPlanItem.updateMany({ where: { monthPlanId: plan.id, status: "PLANNED" }, data: { approvedAt: null, approvedById: null } }),
  ]);
  await audit(monthKeyStr, "REOPEN", {});
  revalidatePath("/mkt/plan");
  return { success: true };
}

/**
 * AI đề xuất CẢ THÁNG: chủ đề + chia bài từng tuần theo đúng chỉ tiêu.
 *
 * Ghi thẳng vào DB dưới dạng NHÁP (tháng DRAFT, dòng chưa duyệt) để HR sửa trực tiếp trên bảng —
 * kế hoạch tháng có 12–15 dòng, giữ trong state của form rồi mới lưu thì mất hết nếu lỡ tải lại.
 * ⚠ Chỉ chạy khi tháng CHƯA có dòng nào: chạy lại trên tháng đã có kế hoạch sẽ đẻ bài trùng.
 */
export async function suggestMonthPlan(monthKeyStr: string, _prev: MonthState, formData: FormData): Promise<MonthState> {
  await requirePermission("mkt.review");
  if (!(await hasPermission("mkt.generate"))) return { error: "NO_GENERATE_PERM" };
  const t = await getTranslations("ai.errors");
  if (!isAiConfigured()) return { aiError: t("NOT_CONFIGURED") };

  const month = parseMonthKey(monthKeyStr);
  if (!month) return { error: "BAD_MONTH" };
  const weeks = mondaysInMonth(month).map(weekKey);
  if (weeks.length === 0) return { error: "BAD_MONTH" };

  const plan = await prisma.mktMonthPlan.findUnique({ where: { month }, select: { id: true, theme: true, status: true, _count: { select: { items: true } } } });
  if (plan?.status === "APPROVED") return { error: "LOCKED" };
  if (plan && plan._count.items > 0) return { error: "HAS_ITEMS" };

  const [types, recent, planned] = await Promise.all([
    prisma.optionItem.findMany({ where: { set: { code: "mkt_content_type" }, isActive: true }, orderBy: { sort: "asc" }, select: { id: true, code: true, labelVi: true } }),
    prisma.mktPost.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { title: true } }),
    prisma.mktPlanItem.findMany({ where: { status: { not: "SKIPPED" } }, orderBy: { weekStart: "desc" }, take: 30, select: { title: true } }),
  ]);

  let parsed;
  try {
    const raw = await aiChatJson<unknown>(
      mktMonthSuggestPrompt({
        monthLabel: `${String(month.getUTCMonth() + 1).padStart(2, "0")}/${month.getUTCFullYear()}`,
        weeks,
        contentTypes: types.map((x) => ({ code: x.code, label: x.labelVi })),
        recentTitles: recent.map((x) => x.title),
        plannedTitles: planned.map((x) => x.title),
        themeHint: str(formData.get("themeHint"), MAX_MKT_TITLE) || plan?.theme || null,
      }),
      { temperature: 0.7, maxTokens: 6000 },
    );
    parsed = mktMonthSuggestSchema.safeParse(raw);
  } catch (e) {
    if (e instanceof AiError) {
      if (e.detail) console.error(`[MKT-MONTH-AI] ${e.code}:`, e.detail);
      return { aiError: t(e.code) };
    }
    console.error("[MKT-MONTH-AI] lỗi không xác định:", e);
    return { aiError: t("UNKNOWN") };
  }
  if (!parsed.success) return { error: "AI_SHAPE" };

  // Lọc lại bằng CODE — AI gợi ý, code gác: tuần phải nằm trong tháng, mã loại phải có thật.
  const weekSet = new Set(weeks);
  const typeByCode = new Map(types.map((x) => [x.code, x.id]));
  const rows = parsed.data.items
    .filter((it) => weekSet.has(it.weekStart))
    .map((it) => ({
      weekStart: new Date(it.weekStart + "T00:00:00.000Z"),
      title: it.title,
      keyPoints: it.keyPoints,
      channels: channelsToCsv(it.channels),
      contentTypeId: it.contentTypeCode ? (typeByCode.get(it.contentTypeCode) ?? null) : null,
      aiSuggested: true,
    }))
    .filter((r) => r.channels !== "");
  if (rows.length === 0) return { error: "AI_SHAPE" };

  const staffId = await getCurrentStaffId();
  await prisma.$transaction(async (tx) => {
    const p =
      plan ??
      (await tx.mktMonthPlan.create({ data: { month, theme: parsed.data.theme, goals: parsed.data.goals, aiSuggested: true, createdById: staffId } }));
    if (plan) await tx.mktMonthPlan.update({ where: { id: p.id }, data: { theme: parsed.data.theme, goals: parsed.data.goals, aiSuggested: true } });
    // Kiểm LẠI trong transaction: cửa sổ giữa lần đếm đầu và lúc ghi dài bằng cả lượt gọi AI (tới
    // 90s) — hai người cùng bấm cách nhau 20 giây là tháng có hai kế hoạch chồng nhau (bài học
    // generateOutline của KB-H3).
    const n = await tx.mktPlanItem.count({ where: { monthPlanId: p.id } });
    if (n > 0) return;
    await tx.mktPlanItem.createMany({ data: rows.map((r) => ({ ...r, monthPlanId: p.id, createdById: staffId })) });
  });

  await audit(monthKeyStr, "AI_SUGGEST", { theme: parsed.data.theme, items: rows.length });
  revalidatePath("/mkt/plan");
  return { success: true };
}
