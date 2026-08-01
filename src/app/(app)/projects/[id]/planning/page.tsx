import { notFound } from "next/navigation";
import { NumberField } from "@/components/ui/number-field";
import { Lock, CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { isPlanningJobLocked, orderRecipientWhere, type PlanningStageCode } from "@/lib/planning";
import { getDepartmentTasks, getDepartmentStaffOptions, toDepartmentTaskBoardData } from "@/lib/department-tasks";
import { DepartmentTaskBoard } from "../department-task-board";
import {
  assignPlanningStage,
  completePlanningStage,
  submitProposalVersion,
  requestProposalRevision,
  confirmFinalProposal,
} from "./actions";
import { requirePermission } from "@/lib/permissions";

const input =
  "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export default async function ProjectPlanningPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.view");
  const { id } = await params;

  const [t, tTasks, locale, job, planningStaff, planningDept, project, deptTasks, deptStaffOptions] = await Promise.all([
    getTranslations("projects.planning"),
    getTranslations("projects.deptTasks"),
    getLocale() as Promise<Locale>,
    prisma.planningJob.findFirst({
      where: { projectId: id },
      include: {
        project: { include: { status: true } },
        requestedBy: true,
        finalConfirmedBy: true,
        stages: { orderBy: { sort: "asc" }, include: { assignee: true, assignedBy: true } },
        versions: { orderBy: { versionNo: "desc" }, include: { submittedBy: true, reviewedBy: true } },
      },
    }),
    // Người nhận khâu Planning = ai có cờ `isPlanningStaff`, KHÔNG phải ai thuộc phòng "PLANNING":
    // bộ phận Planning độc lập đã giải thể 01/08/2026, nhân sự về thẳng các team Account.
    prisma.staff.findMany({ where: orderRecipientWhere("PLANNING"), orderBy: { fullName: "asc" } }),
    prisma.department.findUnique({ where: { code: "PLANNING" }, include: { lead: true } }),
    prisma.project.findUnique({ where: { id }, include: { status: true } }),
    getDepartmentTasks(id, "PLANNING"),
    getDepartmentStaffOptions("PLANNING"),
  ]);
  if (!project) notFound();

  const deptTaskBoardData = deptTasks.map((task) => toDepartmentTaskBoardData(task, project.status.code, project.finishedAt));
  const deptTaskSection = (
    <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{tTasks("title")}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{tTasks("subtitle")}</p>
      </div>
      <DepartmentTaskBoard projectId={id} department="PLANNING" tasks={deptTaskBoardData} staffOptions={deptStaffOptions} />
    </section>
  );

  if (!job) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        </div>
        <div className="rounded-xl border border-dashed border-border-strong bg-surface-2/40 p-6 text-center">
          <p className="text-sm text-foreground">{t("noJob")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("noJobHint")}</p>
        </div>
        {deptTaskSection}
      </div>
    );
  }

  const locked = isPlanningJobLocked(job.project.status.code, job.finalConfirmedAt);
  const staffOptions = planningStaff;
  const stageByCode = new Map(job.stages.map((s) => [s.stage, s]));
  const latestVersion = job.versions[0] ?? null;
  const proposalStage = stageByCode.get("PROPOSAL");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        </div>
        {job.finalConfirmedAt ? (
          <Badge tone="success">{t("phaseFINAL")}</Badge>
        ) : locked ? (
          <Badge tone="danger">{t("lockedCancel")}</Badge>
        ) : null}
      </div>

      {locked && (
        <p className="flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> {job.finalConfirmedAt ? t("lockedFinal") : t("lockedCancel")}
        </p>
      )}

      {/* Brief đã nhận */}
      <section className="rounded-xl border border-border bg-surface p-5 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{t("briefTitle")}</h3>
        {job.briefLinkUrl && (
          <p className="text-sm">
            <span className="text-muted-foreground">{t("briefLink")}: </span>
            <a href={job.briefLinkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
              {job.briefLinkUrl} <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        )}
        {job.briefNote && (
          <p className="text-sm text-muted-foreground">
            <span className="text-foreground">{t("briefNote")}: </span>
            {job.briefNote}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t("requestedByLabel")}: {job.requestedBy?.fullName ?? "—"}
          {" · "}
          {t("managerLabel")}: {planningDept?.lead?.fullName ?? t("managerUnassigned")}
        </p>
        {job.finalConfirmedAt && (
          <p className="text-xs text-success">
            {t("finalConfirmedInfo", { name: job.finalConfirmedBy?.fullName ?? "—", date: formatDateTime(job.finalConfirmedAt, locale) })}
          </p>
        )}
      </section>

      {/* 3 khâu */}
      {(["RESEARCH", "DESIGN_BRIEF"] as PlanningStageCode[]).map((code) => {
        const stage = stageByCode.get(code);
        if (!stage) return null;
        return (
          <StageCard
            key={code}
            jobId={job.id}
            stageId={stage.id}
            title={t(`stage${code}`)}
            assigneeName={stage.assignee?.fullName ?? null}
            dueAt={stage.dueAt}
            resultLinkUrl={stage.resultLinkUrl}
            hoursSpent={stage.hoursSpent}
            completedAt={stage.completedAt}
            locked={locked}
            staffOptions={staffOptions}
            showApplyToRemaining={code === "RESEARCH" && job.stages.every((s) => !s.assigneeId)}
            locale={locale}
            t={t}
          />
        );
      })}

      {/* Proposal — assign + version rounds */}
      {proposalStage && (
        <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{t("stagePROPOSAL")}</h3>
            {proposalStage.assignee ? (
              <span className="text-xs text-muted-foreground">{t("stageAssignedTo", { name: proposalStage.assignee.fullName })}</span>
            ) : (
              <Badge tone="neutral">{t("stageUnassigned")}</Badge>
            )}
            {proposalStage.dueAt && <span className="text-xs text-muted-foreground">· {t("stageDueAt")}: {formatDate(proposalStage.dueAt)}</span>}
          </div>

          {!locked && (
            <form action={assignPlanningStage.bind(null, job.id, proposalStage.id)} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <SearchableSelect
                name="assigneeId"
                defaultValue={proposalStage.assigneeId ?? ""}
                required
                placeholder={t("selectAssignee")}
                className="min-w-[160px]"
                options={staffOptions.map((s) => ({ value: s.id, label: s.fullName }))}
              />
              <label className="text-xs text-muted-foreground">
                {t("dueAtLabel")}
                <DateField name="dueAt" defaultValue={toDateInput(proposalStage.dueAt)} className={input + " ml-1"} />
              </label>
              <button type="submit" className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
                {proposalStage.assigneeId ? t("reassign") : t("assign")}
              </button>
            </form>
          )}

          {/* Version rounds */}
          <div className="border-t border-border pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("versionsTitle")}</h4>
            {job.versions.length === 0 && !proposalStage.assigneeId && (
              <p className="mt-1 text-xs text-muted-foreground">{t("proposalNotAssignedYet")}</p>
            )}
            <div className="mt-2 space-y-2">
              {job.versions.map((v) => (
                <div key={v.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{t("versionLabel", { no: v.versionNo })}</span>
                    <Badge tone={v.status === "FINAL" ? "success" : v.status === "NEEDS_REVISION" ? "warning" : "brand"}>
                      {t(`versionStatus${v.status}`)}
                    </Badge>
                  </div>
                  <a href={v.resultLinkUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs font-medium text-brand-600 hover:underline">
                    {v.resultLinkUrl}
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("versionSubmittedBy", { name: v.submittedBy?.fullName ?? "—", date: formatDateTime(v.submittedAt, locale) })}
                    {v.hoursSpent != null && ` · ${v.hoursSpent}h`}
                  </p>
                  {v.reviewNote && <p className="mt-1 text-xs text-warning">{t("versionReviewNote", { note: v.reviewNote })}</p>}
                  {v.reviewedAt && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("versionReviewedBy", { name: v.reviewedBy?.fullName ?? "—", date: formatDateTime(v.reviewedAt, locale) })}
                    </p>
                  )}

                  {/* Manager review — chỉ hiện khi version này đang chờ review */}
                  {!locked && v.status === "IN_REVIEW" && (
                    <div className="mt-2 space-y-2 border-t border-border pt-2">
                      <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("reviewTitle")}</h5>
                      <form action={confirmFinalProposal.bind(null, v.id)}>
                        <button type="submit" className="h-8 rounded-lg bg-success px-3 text-xs font-medium text-white hover:bg-success/90">
                          {t("confirmFinal")}
                        </button>
                      </form>
                      <p className="text-[11px] text-muted-foreground">{t("confirmFinalHint")}</p>
                      <form action={requestProposalRevision.bind(null, v.id)} className="space-y-1.5">
                        <textarea
                          name="reviewNote"
                          placeholder={t("requestRevisionNote")}
                          rows={2}
                          className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                          required
                        />
                        <button type="submit" className="h-8 rounded-lg border border-warning/40 px-3 text-xs font-medium text-warning hover:bg-warning/10">
                          {t("requestRevision")}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Nộp version mới — chỉ khi đã giao Proposal và chưa có version nào đang chờ review */}
            {!locked && proposalStage.assigneeId && (!latestVersion || latestVersion.status === "NEEDS_REVISION") && (
              <form action={submitProposalVersion.bind(null, job.id)} className="mt-3 space-y-2 border-t border-border pt-3">
                <h4 className="text-xs font-semibold text-foreground">{t("submitVersionTitle")}</h4>
                <div className="flex flex-wrap items-end gap-2">
                  <input name="resultLinkUrl" type="url" placeholder={t("resultLinkLabel")} className={input + " min-w-[220px] flex-1"} required />
                  <label className="text-xs text-muted-foreground">
                    {t("hoursLabel")}
                    <NumberField decimals={2} name="hoursSpent" placeholder="0.25" className={input + " ml-1 w-20"} required />
                  </label>
                  <button type="submit" className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
                    {t("submitVersion")}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("hoursHint")}</p>
              </form>
            )}
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground sm:hidden">{t("mobileNote")}</p>

      {/* Task từ timeline — bên cạnh luồng Proposal cũ, KHÔNG thay thế. */}
      {deptTaskSection}
    </div>
  );
}

function StageCard({
  jobId,
  stageId,
  title,
  assigneeName,
  dueAt,
  resultLinkUrl,
  hoursSpent,
  completedAt,
  locked,
  staffOptions,
  showApplyToRemaining,
  locale,
  t,
}: {
  jobId: string;
  stageId: string;
  title: string;
  assigneeName: string | null;
  dueAt: Date | null;
  resultLinkUrl: string | null;
  hoursSpent: number | null;
  completedAt: Date | null;
  locked: boolean;
  staffOptions: { id: string; fullName: string }[];
  showApplyToRemaining: boolean;
  locale: Locale;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {completedAt ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {assigneeName ? (
          <span className="text-xs text-muted-foreground">{t("stageAssignedTo", { name: assigneeName })}</span>
        ) : (
          <Badge tone="neutral">{t("stageUnassigned")}</Badge>
        )}
        {dueAt && <span className="text-xs text-muted-foreground">· {t("stageDueAt")}: {formatDate(dueAt)}</span>}
      </div>

      {completedAt && resultLinkUrl && (
        <div className="rounded-lg border border-success/30 bg-success-bg p-2.5">
          <a href={resultLinkUrl} target="_blank" rel="noreferrer" className="block truncate text-xs font-medium text-brand-600 hover:underline">
            {resultLinkUrl}
          </a>
          <p className="mt-0.5 text-xs text-success">
            {t("stageCompletedAt")}: {formatDateTime(completedAt, locale)}
            {hoursSpent != null && ` · ${hoursSpent}h`}
          </p>
        </div>
      )}

      {!locked && !completedAt && (
        <form action={assignPlanningStage.bind(null, jobId, stageId)} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <SearchableSelect
            name="assigneeId"
            required
            defaultValue=""
            placeholder={t("selectAssignee")}
            className="min-w-[160px]"
            options={staffOptions.map((s) => ({ value: s.id, label: s.fullName }))}
          />
          <label className="text-xs text-muted-foreground">
            {t("dueAtLabel")}
            <DateField name="dueAt" className="ml-1 h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
          </label>
          <button type="submit" className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
            {t(assigneeName ? "reassign" : "assign")}
          </button>
          {showApplyToRemaining && (
            <label className="flex w-full items-center gap-2 text-xs text-foreground">
              <input type="checkbox" name="applyToRemaining" className="h-4 w-4 rounded border-border-strong" />
              {t("applyToRemaining")}
            </label>
          )}
        </form>
      )}

      {!locked && assigneeName && !completedAt && (
        <form action={completePlanningStage.bind(null, jobId, stageId)} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <input name="resultLinkUrl" type="url" placeholder={t("resultLinkLabel")} className="h-9 min-w-[200px] flex-1 rounded-lg border border-border-strong bg-surface px-2.5 text-sm" required />
          <label className="text-xs text-muted-foreground">
            {t("hoursLabel")}
            <NumberField decimals={2} name="hoursSpent" placeholder="0.25" className="ml-1 h-9 w-20 rounded-lg border border-border-strong bg-surface px-2.5 text-sm" required />
          </label>
          <button type="submit" className="h-9 rounded-lg bg-success px-3 text-xs font-medium text-white hover:bg-success/90">
            {t("submitResult")}
          </button>
          <p className="w-full text-[11px] text-muted-foreground">{t("hoursHint")}</p>
        </form>
      )}
    </section>
  );
}
