"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDateTime } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { parseSnapshot, diffSnapshots, type LineDiff } from "@/lib/costsheet-diff";

export type RevisionData = {
  id: string;
  revNo: number;
  isBaseline: boolean;
  createdAt: Date;
  createdByName: string | null;
  note: string | null;
  ceTotal: number;
  coTotal: number;
  marginPct: number;
  snapshotJson: string;
};

function money(v: number, locale: Locale) {
  return formatNumber(v, locale);
}

export function RevisionCompare({ revisions }: { revisions: RevisionData[] }) {
  const t = useTranslations("projects.coce");
  const locale = useLocale() as Locale;

  // Mặc định: so bản áp chót → mới nhất (nếu có ≥2).
  const latest = revisions[0];
  const prev = revisions[1];
  const [fromId, setFromId] = useState(prev?.id ?? latest?.id ?? "");
  const [toId, setToId] = useState(latest?.id ?? "");

  const from = revisions.find((r) => r.id === fromId);
  const to = revisions.find((r) => r.id === toId);
  const diff = from && to ? diffSnapshots(parseSnapshot(from.snapshotJson), parseSnapshot(to.snapshotJson)) : null;
  const changed = diff?.lines.filter((l) => l.kind !== "unchanged") ?? [];

  const sel =
    "h-9 rounded-lg border border-border-strong bg-surface px-2 text-sm outline-none focus:border-brand-400";

  return (
    <div className="space-y-4">
      {/* Revision history */}
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("revisionsTitle")}</h3>
        <div className="mt-2 overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">{t("revNo")}</th>
                <th className="py-2 pr-3">{t("createdAt")}</th>
                <th className="py-2 pr-3">{t("createdBy")}</th>
                <th className="py-2 pr-3 text-right">{t("coTotal")}</th>
                <th className="py-2 pr-3 text-right">{t("ceTotal")}</th>
                <th className="py-2 pr-3">{t("note")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {revisions.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3 font-medium text-foreground">
                    v{r.revNo}{" "}
                    {r.isBaseline && <Badge tone="brand">{t("baseline")}</Badge>}
                    {r.id === latest?.id && !r.isBaseline && <Badge tone="success">{t("latest")}</Badge>}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(r.createdAt, locale)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.createdByName ?? "—"}</td>
                  <td className="py-2 pr-3 text-right text-muted-foreground">{money(r.coTotal, locale)}</td>
                  <td className="py-2 pr-3 text-right text-muted-foreground">{money(r.ceTotal, locale)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compare */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-foreground">{t("compareTitle")}</h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            {t("compareFrom")}
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={sel + " block"}>
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  v{r.revNo}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            {t("compareTo")}
            <select value={toId} onChange={(e) => setToId(e.target.value)} className={sel + " block"}>
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  v{r.revNo}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!diff ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("selectTwo")}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {/* Summary chips */}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="success">{diff.addedCount} {t("summaryAdded")}</Badge>
              <Badge tone="danger">{diff.removedCount} {t("summaryRemoved")}</Badge>
              <Badge tone="warning">{diff.changedCount} {t("summaryChanged")}</Badge>
            </div>

            {/* Totals delta */}
            <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-surface-2/40 p-2 text-xs">
              <span>{t("coDelta")}: <DeltaNum v={diff.totalsDelta.coTotal} locale={locale} /></span>
              <span>{t("ceDelta")}: <DeltaNum v={diff.totalsDelta.ceTotal} locale={locale} /></span>
              <span>{t("marginDelta")}: <span className={diff.totalsDelta.marginPct >= 0 ? "text-success" : "text-danger"}>{diff.totalsDelta.marginPct > 0 ? "+" : ""}{diff.totalsDelta.marginPct.toFixed(1)}%</span></span>
            </div>

            {changed.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noChanges")}</p>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="sticky top-0 z-10 border-b border-border bg-surface text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">{t("diffSection")}</th>
                      <th className="py-2 pr-3">{t("diffItem")}</th>
                      <th className="py-2 pr-3 text-right">{t("diffBefore")}</th>
                      <th className="py-2 pr-3 text-right">{t("diffAfter")}</th>
                      <th className="py-2 pr-3 text-right">{t("diffDelta")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {changed.map((l, i) => (
                      <DiffRow key={i} line={l} locale={locale} t={t} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DeltaNum({ v, locale }: { v: number; locale: Locale }) {
  const cls = v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted-foreground";
  return <span className={cls}>{v > 0 ? "+" : ""}{formatNumber(v, locale)}</span>;
}

function DiffRow({ line, locale, t }: { line: LineDiff; locale: Locale; t: ReturnType<typeof useTranslations> }) {
  const kindBadge =
    line.kind === "added" ? <Badge tone="success">{t("kindAdded")}</Badge> :
    line.kind === "removed" ? <Badge tone="danger">{t("kindRemoved")}</Badge> :
    <Badge tone="warning">{t("kindChanged")}</Badge>;
  return (
    <tr>
      <td className="py-2 pr-3 text-muted-foreground">{line.sectionName}</td>
      <td className="py-2 pr-3 text-foreground">
        <span className="mr-2">{kindBadge}</span>
        {line.itemName}
      </td>
      <td className="py-2 pr-3 text-right text-muted-foreground">{line.before ? formatNumber(line.before.amount, locale) : "—"}</td>
      <td className="py-2 pr-3 text-right text-muted-foreground">{line.after ? formatNumber(line.after.amount, locale) : "—"}</td>
      <td className="py-2 pr-3 text-right">
        <DeltaNum v={line.amountDelta} locale={locale} />
      </td>
    </tr>
  );
}
