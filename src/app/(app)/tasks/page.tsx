import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { getCurrentStaffId } from "@/lib/current-staff";
import { pickLabel } from "@/lib/utils";
import { taskVisibleWhere, taskOverdue } from "@/lib/tasks";
import type { Locale } from "@/i18n/locales";
import { TasksBoard, CreateTaskForm, type TaskItem } from "./tasks-board";

/**
 * Module Tasks — trang chính. Tab quyết định CÂU TRUY VẤN (bài học /creative/my): "Tôi nhận" /
 * "Tôi giao" / "Theo dõi" lọc theo id của chính mình; "Quản lý" chỉ hiện khi mình là quản lý
 * trực tiếp hoặc trưởng phòng của ai đó; "Tất cả" đòi `tasks.view_all`.
 */

const TABS = ["mine", "given", "follow", "team", "all"] as const;
type Tab = (typeof TABS)[number];

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) redirect("/login");

  const [{ tab: tabRaw }, viewAll, managesCount] = await Promise.all([
    searchParams,
    hasPermission("tasks.view_all"),
    prisma.staff.count({ where: { isActive: true, OR: [{ managerId: meId }, { department: { leadStaffId: meId } }], id: { not: meId } } }),
  ]);
  const isManager = managesCount > 0;
  let tab: Tab = (TABS as readonly string[]).includes(tabRaw ?? "") ? (tabRaw as Tab) : "mine";
  if (tab === "all" && !viewAll) tab = "mine"; // gõ thẳng URL không mở được phạm vi ngoài quyền
  if (tab === "team" && !isManager) tab = "mine";

  const where =
    tab === "mine"
      ? { assigneeId: meId }
      : tab === "given"
        ? { creatorId: meId, assigneeId: { not: meId } }
        : tab === "follow"
          ? { followers: { some: { staffId: meId } } }
          : tab === "team"
            ? { assignee: { id: { not: meId }, OR: [{ managerId: meId }, { department: { leadStaffId: meId } }] } }
            : {}; // all — chỉ tới được khi viewAll

  const [t, locale, tasks, staff, taskTypeSet, projects] = await Promise.all([
    getTranslations("tasks"),
    getLocale() as Promise<Locale>,
    prisma.task.findMany({
      // Tab nào cũng nằm TRONG phạm vi thấy — where của tab chỉ thu hẹp thêm.
      where: viewAll ? where : { AND: [where, taskVisibleWhere(meId)] },
      include: {
        assignee: { select: { id: true, fullName: true } },
        creator: { select: { id: true, fullName: true } },
        type: true,
        project: { select: { code: true } },
        parent: { select: { title: true } },
        children: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
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

  const items: TaskItem[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    typeLabel: task.type ? pickLabel(task.type, locale) : null,
    projectCode: task.project?.code ?? null,
    creatorId: task.creatorId,
    creatorName: task.creator.fullName,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee.fullName,
    dueDate: task.dueDate,
    overdueDays: taskOverdue(task.status, task.dueDate),
    parentId: task.parentId,
    parentTitle: task.parent?.title ?? null,
    subDone: task.children.filter((c) => c.status === "DONE" || c.status === "CANCELED").length,
    subTotal: task.children.length,
  }));
  const overdueCount = items.filter((x) => x.overdueDays != null).length;

  const tabsToShow: Tab[] = ["mine", "given", "follow", ...(isManager ? (["team"] as Tab[]) : []), ...(viewAll ? (["all"] as Tab[]) : [])];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href="/tasks/recurring" className="h-8 rounded-lg border border-border-strong px-3 text-xs leading-8 text-foreground hover:bg-surface-2">
          {t("recurringLink")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabsToShow.map((x) => (
          <Link
            key={x}
            href={x === "mine" ? "/tasks" : `/tasks?tab=${x}`}
            className={
              x === tab
                ? "h-8 rounded-lg bg-brand-600 px-3 text-xs font-medium leading-8 text-white"
                : "h-8 rounded-lg border border-border-strong px-3 text-xs leading-8 text-foreground hover:bg-surface-2"
            }
          >
            {t(`tab_${x}`)}
          </Link>
        ))}
      </div>

      {overdueCount > 0 && (
        <p className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">{t("overdueBanner", { count: overdueCount })}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-xl border border-border bg-surface p-5">
          <TasksBoard tasks={items} meId={meId} />
        </section>
        <div>
          <CreateTaskForm
            staff={staff.map((s) => ({ id: s.id, label: s.fullName, sublabel: [s.title, s.department?.name].filter(Boolean).join(" · ") || undefined }))}
            taskTypes={(taskTypeSet?.items ?? []).map((it) => ({ id: it.id, label: pickLabel(it, locale) }))}
            projects={projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }))}
          />
        </div>
      </div>
    </div>
  );
}
