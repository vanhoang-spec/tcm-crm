import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { isMktAiConfigured, mktAiProviderLabel } from "@/lib/ai/mkt-ai";
import { getStringSetting } from "@/lib/settings";
import { formatDate, pickLabel } from "@/lib/utils";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import {
  MKT_CHANNELS,
  MKT_PLAN_LEAD_DAYS,
  MKT_WEEKLY_TARGET,
  addMonthsUtc,
  addWeeksUtc,
  monthKey,
  monthKeyUtc,
  futureWeeksInMonth,
  mondaysInMonth,
  monthTargetCounts,
  parseChannelsCsv,
  parseMonthKey,
  planDueCutoff,
  planWeekUtc,
  weekKey,
} from "@/lib/mkt";
import type { Locale } from "@/i18n/locales";
import { PlanBoard, type PlanItemView, type WeekView } from "./plan-board";
import { DesignersForm, type DesignerOption } from "./designers-form";
import { MonthPanel, type MonthView } from "./month-panel";

/**
 * MKT-2a — MASTER PLAN theo tuần. Xem: `mkt.view`. Ghi: `mkt.review` (kiểm ở action). AI: `mkt.generate`.
 *
 * Hiện 2 tuần đã qua (để thấy dòng đã dựng) + tuần này + HORIZON tuần tới. Dòng ở tuần ngoài khung
 * (kế hoạch xa hơn) vẫn hiện ở cuối để không "mất" dòng nào.
 */
/** "1" khi min = max, "1–2" khi khác — tránh câu "1–1 bài/tuần". */
const range = (x: { min: number; max: number }) => (x.min === x.max ? String(x.min) : `${x.min}–${x.max}`);

export default async function MktPlanPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePermission("mkt.view");
  const [t, locale, canReview, canGenerate, sp] = await Promise.all([
    getTranslations("mkt.plan"),
    getLocale() as Promise<Locale>,
    hasPermission("mkt.review"),
    hasPermission("mkt.generate"),
    searchParams,
  ]);

  const now = new Date();
  const thisWeek = planWeekUtc(now);
  const cutoff = planDueCutoff(now);
  // MKT-3: trang xoay quanh MỘT THÁNG. Mặc định tháng này; ?month=YYYY-MM để xem tháng khác.
  const month = parseMonthKey(sp.month ?? "") ?? monthKeyUtc(now);
  const monthWeeks = mondaysInMonth(month);
  const from = monthWeeks[0] ?? thisWeek;
  const to = monthWeeks[monthWeeks.length - 1] ?? thisWeek;

  const [items, types, projects, designerRaw, monthPlan, designerPool] = await Promise.all([
    prisma.mktPlanItem.findMany({
      where: { weekStart: { gte: from, lte: to } },
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
        monthPlanId: true,
        note: true,
        aiSuggested: true,
        approvedAt: true,
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
    prisma.mktMonthPlan.findUnique({
      where: { month },
      select: { theme: true, goals: true, note: true, status: true, approvedAt: true, approvedBy: { select: { fullName: true } }, _count: { select: { items: true } } },
    }),
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

// Khung tuần = đúng các thứ Hai của THÁNG đang xem, cộng tuần của dòng nào lệch ra (dòng cũ được
  // dời tuần). addWeeksUtc giữ lại vì khung có thể phải nối thêm tuần.
  const weekKeys = new Set<string>(monthWeeks.map(weekKey));
  for (const i of items) weekKeys.add(weekKey(i.weekStart));
  void addWeeksUtc;
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

  // Đếm bài đã lên kế hoạch theo kênh (bỏ dòng đã bỏ qua) để đối chiếu chỉ tiêu tháng.
  const target = monthTargetCounts(month);
  const planned: Record<string, number> = { LINKEDIN: 0, FANPAGE: 0 };
  for (const i of items) {
    if (i.status === "SKIPPED") continue;
    for (const c of parseChannelsCsv(i.channels)) planned[c] = (planned[c] ?? 0) + 1;
  }
  const monthView: MonthView = {
    monthKey: monthKey(month),
    label: `${String(month.getUTCMonth() + 1).padStart(2, "0")}/${month.getUTCFullYear()}`,
    theme: monthPlan?.theme ?? "",
    goals: monthPlan?.goals ?? "",
    note: monthPlan?.note ?? null,
    status: monthPlan?.status ?? "DRAFT",
    approvedAt: monthPlan?.approvedAt ? formatDate(monthPlan.approvedAt) : null,
    approvedByName: monthPlan?.approvedBy?.fullName ?? null,
    itemCount: monthPlan?._count.items ?? 0,
    // Số dòng nút "Xoá đề xuất – Chạy lại" SẼ xoá: chỉ dòng còn PLANNED và có gắn kế hoạch tháng.
    // Dòng đã dựng bài / đã bỏ qua không bị đụng — hộp xác nhận phải nói đúng con số đó.
    plannedCount: items.filter((i) => i.monthPlanId && i.status === "PLANNED").length,
    // Tuần TƯƠNG LAI còn lại trong tháng — hết tuần thì AI không đề xuất được nữa (nút khoá).
    futureWeeks: futureWeeksInMonth(month, now).length,
    counts: MKT_CHANNELS.map((c) => ({ channel: c, planned: planned[c] ?? 0, target: target[c] })),
  };
  const prevMonth = monthKey(addMonthsUtc(month, -1));
  const nextMonth = monthKey(addMonthsUtc(month, 1));

  const contentTypes = types.map((x) => ({ value: x.id, label: pickLabel(x, locale) }));
  const projectOpts = projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}`, sublabel: p.client?.name }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
        {t("howItWorks", { li: range(MKT_WEEKLY_TARGET.LINKEDIN), fb: range(MKT_WEEKLY_TARGET.FANPAGE), lead: MKT_PLAN_LEAD_DAYS })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <a href={`/mkt/plan?month=${prevMonth}`} className="inline-flex h-8 items-center rounded-lg border border-border-strong px-2.5 text-xs font-medium hover:bg-surface-2">
          ‹ {prevMonth}
        </a>
        <span className="text-sm font-semibold text-foreground">{monthView.label}</span>
        <a href={`/mkt/plan?month=${nextMonth}`} className="inline-flex h-8 items-center rounded-lg border border-border-strong px-2.5 text-xs font-medium hover:bg-surface-2">
          {nextMonth} ›
        </a>
      </div>

      <MonthPanel month={monthView} canReview={canReview} canGenerate={canGenerate} aiConfigured={isMktAiConfigured()} aiProvider={mktAiProviderLabel()} />

      {canReview && <DesignersForm options={designerOptions} />}

      <PlanBoard weeks={weeks} items={views} contentTypes={contentTypes} projects={projectOpts} canReview={canReview} aiProvider={mktAiProviderLabel()} />
    </div>
  );
}
