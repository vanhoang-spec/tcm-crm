import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getDepartmentTasks, getDepartmentStaffOptions, toDepartmentTaskBoardData } from "@/lib/department-tasks";
import { DepartmentTaskBoard } from "../department-task-board";
import { requirePermission } from "@/lib/permissions";

export default async function ProjectProductionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.view");
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, include: { status: true } });
  if (!project) notFound();

  const [t, deptTasks, deptStaffOptions] = await Promise.all([
    getTranslations("projects.deptTasks"),
    getDepartmentTasks(id, "PRO"),
    getDepartmentStaffOptions("PRO"),
  ]);
  const deptTaskBoardData = deptTasks.map((task) => toDepartmentTaskBoardData(task, project.status.code, project.finishedAt));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <DepartmentTaskBoard projectId={id} department="PRO" tasks={deptTaskBoardData} staffOptions={deptStaffOptions} />
    </div>
  );
}
