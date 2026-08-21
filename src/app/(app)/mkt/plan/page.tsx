import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { getStringSetting } from "@/lib/settings";
import { formatDate, pickLabel } from "@/lib/utils";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import { MKT_PLAN_HORIZON_WEEKS, MKT_PLAN_LEAD_DAYS, MKT_WEEKLY_TARGET, addWeeksUtc, planDueCutoff, planWeekUtc, weekKey } from "@/lib/mkt";
import type { Locale } from "@/i18n/locales";
import { PlanBoard, type PlanItemView, type WeekView } from "./plan-board";
import { SuggestPanel } from "./suggest-panel";
import { DesignersForm, type DesignerOption } from "./designers-form";

/**
 * MKT-2a — MASTER PLAN theo tuần. Xem: `mkt.view`. Ghi: `mkt.review` (kiểm ở action). AI: `mkt.generate`.
 *
 * Hiện 2 tuần đã qua (để thấy dòng đã dựng) + tuần này + HORIZON tuần tới. Dòng ở tuần ngoài khung
 * (kế hoạch xa hơn) vẫn hiện ở cuối để không "mất" dòng nào.
 */
/** "1" khi min = max, "1–2" khi khác — tránh câu "1–1 bài/tuần". */
const range = (x: { min: number; max: number }) => (x.min === x.max ? String(x.min) : `${x.min}–${x.max}`);

export default async function MktPlanPage() {
  await requirePermission("mkt.view");
  const [t, locale, canReview, canGenerate] = await Promise.all([
    getTranslations("mkt.plan"),
    getLocale() as Promise<Locale>,
    hasPermission("mkt.review"),
    hasPermission("mkt.generate"),
  ]);

  const now = new Date();
  const thisWeek = planWeekUtc(now);
  const cutoff = planDueCutoff(now);
  const from = addWeeksUtc(thisWeek, -2);
  const to = addWeeksUtc(thisWeek, MKT_PLAN_HORIZON_WEEKS);

  const [items, types, projects, designerRaw, designerPool] = await Promise.all([
    prisma.mktPlanItem.findMany({
      where: { weekStart: { gte: from } },
      orderBy: [{ weekStart: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        weekStart: true,
        title: true,
        keyPoints: true,
        channels: true,
        contentTypeId: true,
        projectId: true,
        status: true,
        postId: true,
        note: true,
        aiSuggested: true,
        contentType: { select: { labelVi: true, labelEn: true } },
        project: { select: { code: true, name: true } },
      },
    }),
    prisma.optionItem.findMany({ where: { set: { code: "mkt_content_type" }, isActive: true }, orderBy: { sort: "asc" }, select: { id: true, labelVi: true, labelEn: true } }),
    prisma.project.findMany({
      where: { status: { code: { in: [...EXECUTION_STATUS_CODES, "FINISHED"] } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, code: true, name: true, client: { select: { name: true } } },
    }),
    getStringSetting("mkt", "designer_staff_ids", "[]"),
    // Ứng viên nhận brief: phòng Creative (designer/video thường ở đó) + bất kỳ ai đang được tick.
    prisma.staff.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, title: true, department: { select: { code: true, name: true } } },
    }),
  ]);

  let designerIds: string[] = [];
  try {
    const v = JSON.parse(designerRaw);
    designerIds = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    designerIds = [];
  }
  const designerOptions: DesignerOption[] = designerPool
    .filter((s) => s.department?.code === "CREATIVE" || designerIds.includes(s.id))
    .map((s) => ({ id: s.id, name: s.fullName, title: s.title, dept: s.department?.name ?? null, checked: designerIds.includes(s.id) }));

  // Khung tuần: -2 … +HORIZON, cộng thêm tuần của dòng nào nằm xa hơn.
  const weekKeys = new Set<string>();
  for (let w = from; w <= to; w = addWeeksUtc(w, 1)) weekKeys.add(weekKey(w));
  for (const i of items) weekKeys.add(weekKey(i.weekStart));
  const weeks: WeekView[] = [...weekKeys].sort().map((k) => {
    const d = new Date(k + "T00:00:00.000Z");
    return { key: k, label: formatDate(d), isCurrent: k === weekKey(thisWeek), isDue: d <= cutoff };
  });

  const views: PlanItemView[] = items.map((i) => ({
    id: i.id,
    weekKey: weekKey(i.weekStart),
    title: i.title,
    keyPoints: i.keyPoints,
    channels: i.channels,
    contentTypeId: i.contentTypeId,
    contentTypeLabel: i.contentType ? pickLabel(i.contentType, locale) : null,
    projectId: i.projectId,
    projectLabel: i.project ? `${i.project.code} — ${i.project.name}` : null,
    status: i.status,
    postId: i.postId,
    note: i.note,
    aiSuggested: i.aiSuggested,
  }));

  const contentTypes = types.map((x) => ({ value: x.id, label: pickLabel(x, locale) }));
  const projectOpts = projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}`, sublabel: p.client?.name }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
        {t("howItWorks", { li: range(MKT_WEEKLY_TARGET.LINKEDIN), fb: range(MKT_WEEKLY_TARGET.FANPAGE), lead: MKT_PLAN_LEAD_DAYS })}
      </div>

      {canReview && canGenerate && <SuggestPanel weeks={weeks.filter((w) => w.key >= weekKey(thisWeek))} contentTypes={contentTypes} aiConfigured={isAiConfigured()} />}
      {canReview && <DesignersForm options={designerOptions} />}

      <PlanBoard weeks={weeks} items={views} contentTypes={contentTypes} projects={projectOpts} canReview={canReview} />
    </div>
  );
}
