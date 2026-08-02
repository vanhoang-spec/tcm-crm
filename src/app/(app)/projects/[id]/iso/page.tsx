import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { loadIsoRow, loadProjectFiles } from "@/lib/iso-data";
import { IsoTable } from "./iso-table";
import { IsoFolderForm } from "./iso-folder-form";

export default async function ProjectIsoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("iso.view");
  const { id } = await params;

  const [t, row, files, canManage] = await Promise.all([
    getTranslations("projects.iso"),
    loadIsoRow(id),
    loadProjectFiles(id),
    hasPermission("iso.manage"),
  ]);
  if (!row) notFound();

  const s = row.summary;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-2xl font-bold text-foreground">{s.completionPct}%</span>
            <span className="ml-2 text-xs text-muted-foreground">{t("completion")}</span>
          </div>
          <span className="text-success">{t("countPresent", { n: s.present })}</span>
          <span className="text-muted-foreground">{t("countNa", { n: s.na })}</span>
          <span className={s.blockingMissing > 0 ? "text-danger" : "text-muted-foreground"}>
            {t("countMissing", { n: s.blockingMissing })}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("autoHint")}</p>
      </section>

      <IsoFolderForm projectId={id} isoFolderUrl={row.isoFolderUrl} canManage={canManage} />

      <IsoTable projectId={id} states={row.states} files={files} canManage={canManage} />
    </div>
  );
}
