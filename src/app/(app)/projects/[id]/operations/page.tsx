import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/utils";
import { getDepartmentTasks, getDepartmentStaffOptions, toDepartmentTaskBoardData } from "@/lib/department-tasks";
import { DepartmentTaskBoard } from "../department-task-board";
import { OperationsPanel, type CtvBatchData } from "./operations-grid";
import { requirePermission } from "@/lib/permissions";

export default async function ProjectOperationsPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.view");
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, include: { status: true } });
  if (!project) notFound();

  const [t, tTasks, batches, deptTasks, deptStaffOptions] = await Promise.all([
    getTranslations("projects.operations"),
    getTranslations("projects.deptTasks"),
    prisma.ctvBatch.findMany({
      where: { projectId: id },
      include: { rows: { orderBy: { sort: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    getDepartmentTasks(id, "OPE"),
    getDepartmentStaffOptions("OPE"),
  ]);
  const deptTaskBoardData = deptTasks.map((task) => toDepartmentTaskBoardData(task, project.status.code, project.finishedAt));

  const batchData: CtvBatchData[] = batches.map((b) => ({
    id: b.id,
    name: b.name,
    programFrom: b.programFrom,
    programTo: b.programTo,
    teamLeader: b.teamLeader,
    workLocation: b.workLocation,
    hasSourceFile: !!b.sourceFileKey,
    rows: b.rows.map((r) => ({
      id: r.id,
      sort: r.sort,
      fullName: r.fullName,
      gender: r.gender,
      dateOfBirth: r.dateOfBirth,
      nationality: r.nationality,
      idNumber: r.idNumber,
      idIssueDate: r.idIssueDate,
      idIssuePlace: r.idIssuePlace,
      permanentAddress: r.permanentAddress,
      taxCode: r.taxCode,
      bankAccountNo: r.bankAccountNo,
      bankName: r.bankName,
      bankBranch: r.bankBranch,
      phone: r.phone,
      eventName: r.eventName,
      executionDate: r.executionDate,
      acceptanceDate: r.acceptanceDate,
      executionLocation: r.executionLocation,
      workItem: r.workItem,
      unit: r.unit,
      quantity: r.quantity,
      unitPrice: r.unitPrice == null ? null : toNum(r.unitPrice),
      amount: r.amount == null ? null : toNum(r.amount),
      grossNet: r.grossNet,
      pitTax: r.pitTax == null ? null : toNum(r.pitTax),
      netReceived: r.netReceived == null ? null : toNum(r.netReceived),
      note: r.note,
      generated: !!r.generatedFileKey,
      generatedAt: r.generatedAt ? r.generatedAt.toISOString() : null,
    })),
  }));

  return (
    <div className="space-y-4">
      {/* Task nội bộ tự sinh từ Master Timeline/Order — phía trên khối CTV hiện có. */}
      <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{tTasks("title")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{tTasks("subtitle")}</p>
        </div>
        <DepartmentTaskBoard projectId={id} department="OPE" tasks={deptTaskBoardData} staffOptions={deptStaffOptions} />
      </section>

      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>
      <OperationsPanel projectId={id} batches={batchData} />
    </div>
  );
}
