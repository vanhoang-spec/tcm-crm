import Link from "next/link";
import { FileDown, FolderOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { loadIsoRows } from "@/lib/iso-data";
import { Badge } from "@/components/ui/badge";

export default async function IsoOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  await requirePermission("iso.view");
  const { team } = await searchParams;

  const [t, teams, canExport] = await Promise.all([
    getTranslations("iso"),
    prisma.team.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    hasPermission("iso.export"),
  ]);
  const rows = await loadIsoRows(team ? { teamId: team } : {});

  const totalDocs = rows.reduce((a, r) => a + r.summary.total, 0);
  const totalDone = rows.reduce((a, r) => a + r.summary.present + r.summary.na, 0);
  const overallPct = totalDocs === 0 ? 0 : Math.round((totalDone / totalDocs) * 100);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        </div>
        {canExport && (
          <a
            href={`/api/iso/export${team ? `?team=${team}` : ""}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700"
          >
            <FileDown className="h-3.5 w-3.5" />
            {t("export")}
          </a>
        )}
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <span className="text-2xl font-bold text-foreground">{overallPct}%</span>
            <span className="ml-2 text-xs text-muted-foreground">{t("overall", { projects: rows.length })}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Link
            href="/iso"
            className={`rounded-md px-2 py-1 text-[11px] ${!team ? "bg-brand-600 text-white" : "border border-border-strong text-foreground hover:bg-surface-2"}`}
          >
            {t("filterAll")}
          </Link>
          {teams.map((tm) => (
            <Link
              key={tm.id}
              href={`/iso?team=${tm.id}`}
              className={`rounded-md px-2 py-1 text-[11px] ${team === tm.id ? "bg-brand-600 text-white" : "border border-border-strong text-foreground hover:bg-surface-2"}`}
            >
              {tm.code}
            </Link>
          ))}
        </div>
      </section>

      <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("colProject")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colClient")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colTeam")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colOwner")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colStatus")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("colPct")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("colMissing")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colFolder")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-xs text-muted-foreground">{t("empty")}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <Link href={`/projects/${r.id}/iso`} className="font-medium text-brand-600 hover:underline">
                    {r.code}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">{r.name}</p>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.clientName}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.teamCode ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.ownerName ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.statusLabelVi}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Badge tone={r.summary.completionPct >= 80 ? "success" : r.summary.completionPct >= 40 ? "warning" : "danger"}>
                    {r.summary.completionPct}%
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.summary.blockingMissing}</td>
                <td className="px-3 py-2">
                  {r.isoFolderUrl ? (
                    <a href={r.isoFolderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline">
                      <FolderOpen className="h-3 w-3" />
                      {t("openFolder")}
                    </a>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
