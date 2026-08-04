import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus, ExternalLink, ImageIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { getStringSetting } from "@/lib/settings";
import { formatDate, pickLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  MKT_CADENCE_WEEKS,
  MKT_CHANNELS,
  MKT_WEEKLY_TARGET,
  computeWeeklyCadence,
  addDays,
  type MktChannel,
} from "@/lib/mkt";
import type { Locale } from "@/i18n/locales";
import { FrameLinksForm } from "./frame-links-form";

const CHANNEL_TONE: Record<string, "success" | "warning" | "neutral"> = {
  POSTED: "success",
  AI_DRAFTED: "warning",
  DRAFT: "neutral",
};

export default async function MktPostsPage() {
  await requirePermission("mkt.view");
  const [t, locale, canManage, canFrames] = await Promise.all([
    getTranslations("mkt"),
    getLocale() as Promise<Locale>,
    hasPermission("mkt.post.manage"),
    hasPermission("mkt.frames.manage"),
  ]);

  // Chỉ kéo variant ĐÃ ĐĂNG trong khung 4 tuần để tính nhịp — bảng có thể phình theo năm, đếm cả
  // bảng mỗi lần mở trang là lãng phí.
  const now = new Date();
  const since = addDays(now, -7 * (MKT_CADENCE_WEEKS + 1));
  const [posts, postedRows, framesLinkedin, framesFanpage] = await Promise.all([
    prisma.mktPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        createdAt: true,
        contentType: { select: { labelVi: true, labelEn: true } },
        project: { select: { code: true } },
        _count: { select: { images: true } },
        variants: { select: { channel: true, status: true } },
      },
    }),
    prisma.mktPostVariant.findMany({
      where: { status: "POSTED", postedAt: { gte: since } },
      select: { channel: true, postedAt: true },
    }),
    getStringSetting("mkt", "frames_linkedin_url", ""),
    getStringSetting("mkt", "frames_fanpage_url", ""),
  ]);

  const cadence = computeWeeklyCadence(
    postedRows.flatMap((p) => (p.postedAt ? [{ channel: p.channel, postedAt: p.postedAt }] : [])),
    now,
  );
  const thisWeek = cadence[0];

  return (
    <div className="space-y-4">
      {/* ── Nhịp đăng ── */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("cadenceTitle")}</h2>
          <p className="text-[11px] text-muted-foreground">{t("cadenceTarget")}</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {MKT_CHANNELS.map((ch) => {
            const n = thisWeek.counts[ch];
            const target = MKT_WEEKLY_TARGET[ch];
            const enough = n >= target.min;
            return (
              <div key={ch} className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{t(`channel${ch}` as "channelLINKEDIN")}</span>
                  <span className={"text-lg font-bold tabular-nums " + (enough ? "text-success" : "text-warning")}>
                    {n}/{target.min === target.max ? target.min : `${target.min}–${target.max}`}
                  </span>
                </div>
                <p className={"mt-0.5 text-[11px] " + (enough ? "text-success" : "text-warning")}>
                  {enough ? t("cadenceOk") : t("cadenceMissing")}
                </p>
                <div className="mt-2 flex gap-1.5">
                  {/* Đảo lại cho tuần CŨ NHẤT ở bên trái — đọc trái sang phải là đi theo thời gian. */}
                  {[...cadence].reverse().map((w) => (
                    <div key={w.start.toISOString()} className="flex-1 text-center" title={t("cadenceWeekOf", { date: formatDate(w.start) })}>
                      <div
                        className={
                          "h-1.5 rounded-full " + (w.counts[ch] >= target.min ? "bg-success" : w.counts[ch] > 0 ? "bg-warning" : "bg-border-strong")
                        }
                      />
                      <span className="text-[10px] tabular-nums text-muted-foreground">{w.counts[ch]}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Link thư mục frame ── */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("framesTitle")}</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("framesHint")}</p>
        {!canFrames && (
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <FrameLink label={t("framesLinkedin")} url={framesLinkedin} empty={t("framesEmpty")} />
            <FrameLink label={t("framesFanpage")} url={framesFanpage} empty={t("framesEmpty")} />
          </div>
        )}
        {canFrames && <FrameLinksForm linkedinUrl={framesLinkedin} fanpageUrl={framesFanpage} />}
      </section>

      {/* ── Danh sách bài ── */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("navPosts")}</h2>
        {canManage && (
          <Link
            href="/mkt/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            {t("newPost")}
          </Link>
        )}
      </div>

      {posts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("colPost")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colType")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colProject")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colChannels")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colDate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {posts.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <Link href={`/mkt/${p.id}`} className="font-medium text-brand-600 hover:underline">
                      {p.title}
                    </Link>
                    {p._count.images > 0 && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <ImageIcon className="h-3 w-3" />
                        {p._count.images}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground">
                    {p.contentType ? pickLabel(p.contentType, locale) : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{p.project?.code ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {MKT_CHANNELS.map((ch) => {
                        const v = p.variants.find((x) => x.channel === ch);
                        if (!v) return null;
                        return (
                          <Badge key={ch} tone={CHANNEL_TONE[v.status] ?? "neutral"}>
                            {t(`channel${ch as MktChannel}` as "channelLINKEDIN")} · {t(`status${v.status}` as "statusDRAFT")}
                          </Badge>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FrameLink({ label, url, empty }: { label: string; url: string; empty: string }) {
  if (!url) {
    return (
      <span className="text-xs text-muted-foreground">
        {label}: {empty}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}
