"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { AiError, aiChatJson, isAiConfigured } from "@/lib/ai/deepseek";
import { mktPlanSuggestPrompt } from "@/lib/ai/mkt-prompts";
import { draftPlanItem } from "@/lib/mkt-plan-server";
import {
  MAX_MKT_KEY_POINTS,
  MAX_MKT_NOTE,
  MAX_MKT_TITLE,
  MKT_CHANNELS,
  MKT_PLAN_HORIZON_WEEKS,
  addWeeksUtc,
  channelsToCsv,
  mktPlanSuggestSchema,
  parseWeekKey,
  planWeekUtc,
  weekKey,
  type MktPlanSuggestItem,
} from "@/lib/mkt";

/**
 * MKT-2a — MASTER PLAN nội dung.
 *
 * Mọi đường GHI gác `mkt.review` (HR là người cầm kế hoạch đăng bài — cùng vai với duyệt/đăng).
 * AI đề xuất kế hoạch kiểm thêm `mkt.generate` BÊN TRONG (đặc quyền tính tiền theo lượt, mirror
 * generateVariant). Trang xem gác `mkt.view`.
 *
 * ⚠ AI đề xuất chỉ TRẢ VỀ FORM cho HR duyệt/sửa — KHÔNG ghi thẳng (mirror parseCvWithAi). Ghi là
 * bước `savePlanItems` riêng, sau khi HR bấm "Lưu vào kế hoạch".
 * ⚠ Dòng đã DRAFTED không sửa/xoá được ở đây nữa — bài đã sống ở mục Bài đăng.
 */

export type PlanState = {
  error?: string;
  aiError?: string;
  success?: boolean;
  /** Kết quả AI đề xuất (chưa lưu) — client hiện bảng duyệt. */
  suggestions?: (MktPlanSuggestItem & { contentTypeId: string | null })[];
};

const str = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);
const nullable = (v: FormDataEntryValue | null, max: number) => str(v, max) || null;

async function audit(entityId: string, action: string, payload: unknown) {
  await prisma.auditLog.create({
    data: { entityType: "mkt_plan", entityId, field: "*", newValue: JSON.stringify(payload), action, changedBy: await getCurrentStaffId() },
  });
}

function readChannels(formData: FormData): string {
  return channelsToCsv(MKT_CHANNELS.filter((c) => String(formData.get(`channel_${c}`) ?? "") !== ""));
}

async function readRefs(formData: FormData): Promise<{ contentTypeId: string | null; projectId: string | null } | { error: string }> {
  const contentTypeId = nullable(formData.get("contentTypeId"), 64);
  const projectId = nullable(formData.get("projectId"), 64);
  if (contentTypeId && !(await prisma.optionItem.findFirst({ where: { id: contentTypeId, set: { code: "mkt_content_type" } }, select: { id: true } })))
    return { error: "BAD_REF" };
  if (projectId && !(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) return { error: "BAD_REF" };
  return { contentTypeId, projectId };
}

export async function createPlanItem(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requirePermission("mkt.review");
  const weekStart = parseWeekKey(str(formData.get("weekStart"), 10));
  if (!weekStart) return { error: "BAD_WEEK" };
  const title = str(formData.get("title"), MAX_MKT_TITLE);
  if (!title) return { error: "NO_TITLE" };
  const channels = readChannels(formData);
  if (!channels) return { error: "NO_CHANNEL" };
  const refs = await readRefs(formData);
  if ("error" in refs) return { error: refs.error };

  const created = await prisma.mktPlanItem.create({
    data: {
      weekStart,
      title,
      keyPoints: str(formData.get("keyPoints"), MAX_MKT_KEY_POINTS),
      channels,
      note: nullable(formData.get("note"), MAX_MKT_NOTE),
      ...refs,
      createdById: await getCurrentStaffId(),
    },
  });
  await audit(created.id, "CREATE", { weekStart: weekKey(weekStart), title, channels });
  revalidatePath("/mkt/plan");
  return { success: true };
}

export async function updatePlanItem(id: string, _prev: PlanState, formData: FormData): Promise<PlanState> {
  await requirePermission("mkt.review");
  const item = await prisma.mktPlanItem.findUnique({ where: { id }, select: { status: true } });
  if (!item) return { error: "NOT_FOUND" };
  if (item.status === "DRAFTED") return { error: "LOCKED" };
  const weekStart = parseWeekKey(str(formData.get("weekStart"), 10));
  if (!weekStart) return { error: "BAD_WEEK" };
  const title = str(formData.get("title"), MAX_MKT_TITLE);
  if (!title) return { error: "NO_TITLE" };
  const channels = readChannels(formData);
  if (!channels) return { error: "NO_CHANNEL" };
  const refs = await readRefs(formData);
  if ("error" in refs) return { error: refs.error };

  await prisma.mktPlanItem.update({
    where: { id },
    data: { weekStart, title, keyPoints: str(formData.get("keyPoints"), MAX_MKT_KEY_POINTS), channels, note: nullable(formData.get("note"), MAX_MKT_NOTE), ...refs },
  });
  await audit(id, "UPDATE", { weekStart: weekKey(weekStart), title, channels });
  revalidatePath("/mkt/plan");
  return { success: true };
}

/** Bỏ (SKIPPED) hoặc khôi phục (PLANNED) một dòng chưa dựng bài. */
export async function togglePlanItemSkip(id: string): Promise<void> {
  await requirePermission("mkt.review");
  const item = await prisma.mktPlanItem.findUnique({ where: { id }, select: { status: true } });
  if (!item || item.status === "DRAFTED") return;
  const status = item.status === "SKIPPED" ? "PLANNED" : "SKIPPED";
  await prisma.mktPlanItem.update({ where: { id }, data: { status } });
  await audit(id, "UPDATE", { status });
  revalidatePath("/mkt/plan");
}

export async function deletePlanItem(id: string): Promise<void> {
  await requirePermission("mkt.review");
  const item = await prisma.mktPlanItem.findUnique({ where: { id }, select: { status: true, title: true } });
  if (!item || item.status === "DRAFTED") return;
  await prisma.mktPlanItem.delete({ where: { id } });
  await audit(id, "DELETE", { title: item.title });
  revalidatePath("/mkt/plan");
}

/** "Dựng bài ngay" — không đợi tới hạn. Cùng đường với job (AI chạy nền, báo lại khi xong). */
export async function draftPlanItemNow(id: string, _prev: PlanState, _formData: FormData): Promise<PlanState> {
  await requirePermission("mkt.review");
  const item = await prisma.mktPlanItem.findUnique({
    where: { id },
    select: { id: true, weekStart: true, title: true, keyPoints: true, channels: true, contentTypeId: true, projectId: true, createdById: true, status: true },
  });
  if (!item) return { error: "NOT_FOUND" };
  if (item.status !== "PLANNED") return { error: "WRONG_STATE" };
  const postId = await draftPlanItem(item);
  if (!postId) return { error: "WRONG_STATE" };
  revalidatePath("/mkt/plan");
  revalidatePath("/mkt");
  return { success: true };
}

// ─────────────────────────────────────────────────────────
// Designer nhận brief
// ─────────────────────────────────────────────────────────

export async function saveDesigners(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requirePermission("mkt.review");
  const wanted = [...new Set(formData.getAll("designerId").map((v) => String(v)).filter(Boolean))];
  // Chỉ nhận người đang hoạt động — không tin payload.
  const valid = (await prisma.staff.findMany({ where: { id: { in: wanted }, isActive: true }, select: { id: true } })).map((s) => s.id);
  const staffId = await getCurrentStaffId();
  await prisma.setting.upsert({
    where: { module_key_scope_scopeRef: { module: "mkt", key: "designer_staff_ids", scope: "GLOBAL", scopeRef: "" } },
    update: { value: JSON.stringify(valid), updatedBy: staffId },
    create: { module: "mkt", key: "designer_staff_ids", value: JSON.stringify(valid), updatedBy: staffId },
  });
  await audit("designers", "UPDATE", { count: valid.length });
  revalidatePath("/mkt/plan");
  return { success: true };
}

// ─────────────────────────────────────────────────────────
// AI đề xuất kế hoạch
// ─────────────────────────────────────────────────────────

export async function suggestPlan(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requirePermission("mkt.review");
  if (!(await hasPermission("mkt.generate"))) return { error: "NO_GENERATE_PERM" };
  const t = await getTranslations("ai.errors");
  if (!isAiConfigured()) return { aiError: t("NOT_CONFIGURED") };

  const from = parseWeekKey(str(formData.get("fromWeek"), 10)) ?? planWeekUtc(new Date());
  const weeks = Array.from({ length: MKT_PLAN_HORIZON_WEEKS }, (_, i) => weekKey(addWeeksUtc(from, i)));

  const [types, recent, planned] = await Promise.all([
    prisma.optionItem.findMany({ where: { set: { code: "mkt_content_type" }, isActive: true }, orderBy: { sort: "asc" }, select: { id: true, code: true, labelVi: true } }),
    prisma.mktPost.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { title: true } }),
    prisma.mktPlanItem.findMany({ where: { status: { not: "SKIPPED" }, weekStart: { gte: addWeeksUtc(from, -4) } }, select: { title: true } }),
  ]);

  let parsed;
  try {
    const raw = await aiChatJson<unknown>(
      mktPlanSuggestPrompt({
        weeks,
        contentTypes: types.map((x) => ({ code: x.code, label: x.labelVi })),
        recentTitles: recent.map((x) => x.title),
        plannedTitles: planned.map((x) => x.title),
      }),
      { temperature: 0.7, maxTokens: 4000 },
    );
    parsed = mktPlanSuggestSchema.safeParse(raw);
  } catch (e) {
    if (e instanceof AiError) {
      if (e.detail) console.error(`[MKT-PLAN-AI] ${e.code}:`, e.detail);
      return { aiError: t(e.code) };
    }
    console.error("[MKT-PLAN-AI] lỗi không xác định:", e);
    return { aiError: t("UNKNOWN") };
  }
  if (!parsed.success) return { error: "AI_SHAPE" };

  // Lọc lại bằng CODE: tuần phải nằm trong danh sách đã đưa, mã loại phải có thật — AI gợi ý, code gác.
  const weekSet = new Set(weeks);
  const typeByCode = new Map(types.map((x) => [x.code, x.id]));
  const suggestions = parsed.data.items
    .filter((it) => weekSet.has(it.weekStart))
    .map((it) => ({ ...it, contentTypeId: it.contentTypeCode ? (typeByCode.get(it.contentTypeCode) ?? null) : null }));
  if (suggestions.length === 0) return { error: "AI_SHAPE" };

  await audit("suggest", "AI_SUGGEST", { weeks, count: suggestions.length });
  return { success: true, suggestions };
}

/** Lưu các dòng HR đã duyệt từ bảng đề xuất (payload JSON) — mỗi dòng kiểm lại như tạo tay. */
export async function savePlanItems(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requirePermission("mkt.review");
  let rows: unknown;
  try {
    rows = JSON.parse(str(formData.get("itemsJson"), 200_000));
  } catch {
    return { error: "BAD_PAYLOAD" };
  }
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 40) return { error: "BAD_PAYLOAD" };

  const staffId = await getCurrentStaffId();
  const data: { weekStart: Date; title: string; keyPoints: string; channels: string; contentTypeId: string | null; aiSuggested: boolean; createdById: string | null }[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const weekStart = parseWeekKey(String(r.weekStart ?? ""));
    const title = String(r.title ?? "").trim().slice(0, MAX_MKT_TITLE);
    const channels = channelsToCsv(Array.isArray(r.channels) ? r.channels.map(String) : []);
    if (!weekStart || !title || !channels) return { error: "BAD_PAYLOAD" };
    const contentTypeId = typeof r.contentTypeId === "string" && r.contentTypeId ? r.contentTypeId : null;
    if (contentTypeId && !(await prisma.optionItem.findFirst({ where: { id: contentTypeId, set: { code: "mkt_content_type" } }, select: { id: true } }))) return { error: "BAD_REF" };
    data.push({ weekStart, title, keyPoints: String(r.keyPoints ?? "").trim().slice(0, MAX_MKT_KEY_POINTS), channels, contentTypeId, aiSuggested: true, createdById: staffId });
  }
  await prisma.mktPlanItem.createMany({ data });
  await audit("bulk", "CREATE", { count: data.length, weeks: [...new Set(data.map((d) => weekKey(d.weekStart)))] });
  revalidatePath("/mkt/plan");
  return { success: true };
}
