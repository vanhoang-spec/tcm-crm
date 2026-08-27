import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { getCurrentStaffId } from "@/lib/current-staff";
import { pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { RecurringList } from "./recurring-form";

/**
 * Lịch lặp — MẪU sinh việc định kỳ (job `tasks-recur`, tick 5 phút). Phạm vi ở TẦNG TRUY VẤN:
 * thấy rule mình TẠO hoặc rule giao CHO mình; `tasks.view_all` thấy hết.
 */
export default async function RecurringTasksPage() {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) redirect("/login");
  const viewAll = await hasPermission("tasks.view_all");

  const [t, locale, rules, staff, taskTypeSet, projects] = await Promise.all([
    getTranslations("tasks"),
    getLocale() as Promise<Locale>,
    prisma.taskRecurrence.findMany({
      where: viewAll ? {} : { OR: [{ creatorId: meId }, { assigneeId: meId }] },
      include: {
        creator: { select: { fullName: true } },
        assignee: { select: { fullName: true } },
        type: true,
        project: { select: { code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, title: true, department: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
    prisma.optionSet.findUnique({ where: { code: "task_type" }, include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } } }),
    prisma.project.findMany({
      where: { status: { code: { notIn: ["FAILED", "CANCELED"] } } },
      select: { id: true, code: true, name: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/tasks" className="text-sm text-muted-foreground hover:text-brand-600 hover:underline">
          ← {t("title")}
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{t("recurringTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("recurringSubtitle")}</p>
      </div>
      <RecurringList
        meId={meId}
        rules={rules.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          priority: r.priority,
          typeId: r.typeId,
          typeLabel: r.type ? pickLabel(r.type, locale) : null,
          projectId: r.projectId,
          projectCode: r.project?.code ?? null,
          creatorId: r.creatorId,
          creatorName: r.creator.fullName,
          assigneeId: r.assigneeId,
          assigneeName: r.assignee.fullName,
          freq: r.freq,
          dayOfWeek: r.dayOfWeek,
          dayOfMonth: r.dayOfMonth,
          dueOffsetDays: r.dueOffsetDays,
          checklistJson: r.checklistJson,
          isActive: r.isActive,
          lastSpawnKey: r.lastSpawnKey,
        }))}
        staff={staff.map((s) => ({ id: s.id, label: s.fullName, sublabel: [s.title, s.department?.name].filter(Boolean).join(" · ") || undefined }))}
        taskTypes={(taskTypeSet?.items ?? []).map((it) => ({ id: it.id, label: pickLabel(it, locale) }))}
        projects={projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }))}
      />
    </div>
  );
}
