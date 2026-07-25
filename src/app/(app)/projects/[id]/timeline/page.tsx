import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { TimelineEditor, type TimelineItemData } from "../timeline-editor";
import { TemplatePicker } from "./template-picker";
import { StaffingMatrix, type StaffingCell } from "./staffing-matrix";
import { requirePermission } from "@/lib/permissions";

const GANTT_COLS = ["pic2", "accountable", "duration", "deadline", "status"];
const CHECKLIST_COLS = ["pic2", "qty", "unit", "deadline", "status"];

export default async function ProjectTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.view");
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, projectTypeId: true } });
  if (!project) notFound();

  const [t, locale, timelineItems, allStaff, departments, statusSet, templates, staffing] = await Promise.all([
    getTranslations("projects.timeline"),
    getLocale() as Promise<Locale>,
    prisma.timelineItem.findMany({ where: { projectId: id }, orderBy: { sort: "asc" } }),
    prisma.staff.findMany({ where: { isActive: true }, include: { department: true }, orderBy: { fullName: "asc" } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.optionSet.findUnique({
      where: { code: "timeline_status" },
      include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } },
    }),
    prisma.timelineTemplate.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.projectStaffing.findMany({ where: { projectId: id }, orderBy: { sort: "asc" } }),
  ]);

  const staffOptions = allStaff.map((s) => ({
    id: s.id,
    label: s.department?.code ? `${s.fullName} · ${s.department.code}` : s.fullName,
  }));
  const statusOptions = (statusSet?.items ?? []).map((it) => ({ id: it.id, label: pickLabel(it, locale) }));
  const departmentOptions = departments.map((d) => ({ code: d.code, name: d.name }));

  // Mẫu phù hợp Nhóm dự án → quyết định viewMode + cột hiển thị.
  const matched = templates.filter((tp) => tp.projectTypeId && tp.projectTypeId === project.projectTypeId);
  const activeTemplate = matched[0] ?? null;
  const viewMode = activeTemplate?.viewMode ?? "GANTT";
  let columns: string[];
  if (activeTemplate?.columnsJson) {
    try {
      columns = JSON.parse(activeTemplate.columnsJson) as string[];
    } catch {
      columns = viewMode === "CHECKLIST" ? CHECKLIST_COLS : GANTT_COLS;
    }
  } else {
    columns = viewMode === "CHECKLIST" ? CHECKLIST_COLS : GANTT_COLS;
  }

  const templateOptions = [
    ...matched.map((tp) => ({ id: tp.id, name: tp.name, viewMode: tp.viewMode, matches: true })),
    ...templates.filter((tp) => !matched.includes(tp)).map((tp) => ({ id: tp.id, name: tp.name, viewMode: tp.viewMode, matches: false })),
  ];

  const timelineData: TimelineItemData[] = timelineItems.map((it) => ({
    id: it.id,
    parentId: it.parentId,
    title: it.title,
    startDate: it.startDate,
    endDate: it.endDate,
    ownerStaffId: it.ownerStaffId,
    secondaryOwnerStaffId: it.secondaryOwnerStaffId,
    departmentCode: it.departmentCode,
    accountableParty: it.accountableParty,
    quantity: it.quantity,
    unit: it.unit,
    statusId: it.statusId,
    isShared: it.isShared,
    externalPublished: it.externalPublished,
    clientEditable: it.clientEditable,
    externalTitle: it.externalTitle,
    externalStartDate: it.externalStartDate,
    externalEndDate: it.externalEndDate,
    clientStatus: it.clientStatus,
    clientNote: it.clientNote,
  }));

  const staffingCells: StaffingCell[] = staffing.map((c) => ({
    id: c.id,
    roleLabel: c.roleLabel,
    zoneLabel: c.zoneLabel,
    headcount: c.headcount,
  }));

  return (
    <div className="space-y-6">
      {/* Template picker */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("templatePickerTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("templatePickerDesc")}</p>
        <div className="mt-3">
          <TemplatePicker projectId={id} templates={templateOptions} />
        </div>
      </section>

      {/* Master Timeline editor */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
            {viewMode === "CHECKLIST" ? t("viewModeChecklist") : t("viewModeGantt")}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("desc")}</p>
        <div className="mt-3">
          <TimelineEditor
            projectId={id}
            items={timelineData}
            staff={staffOptions}
            statuses={statusOptions}
            departments={departmentOptions}
            columns={columns}
          />
        </div>
      </section>

      {/* Staffing matrix — chỉ hiện với mẫu Checklist */}
      {viewMode === "CHECKLIST" && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("staffingTitle")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("staffingDesc")}</p>
          <div className="mt-3">
            <StaffingMatrix projectId={id} cells={staffingCells} />
          </div>
        </section>
      )}
    </div>
  );
}
