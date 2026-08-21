import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { isChannelCryptoConfigured } from "@/lib/mkt-secret";
import { formatDate, formatDateTime } from "@/lib/utils";
import { MKT_CHANNELS } from "@/lib/mkt";
import type { Locale } from "@/i18n/locales";
import { ChannelCard, type ChannelView } from "./channel-forms";

/**
 * MKT-2b — nối kênh đăng bài. Gác `mkt.channel.manage` (Senior HR Manager + BGĐ): mã này nắm access
 * token cho phép đăng công khai dưới danh nghĩa công ty.
 *
 * ⚠ TRANG NÀY KHÔNG BAO GIỜ SELECT `tokenCipher`. Token chỉ đi một chiều vào qua form.
 */
export default async function MktChannelsPage() {
  await requirePermission("mkt.channel.manage");
  const [t, locale, rows] = await Promise.all([
    getTranslations("settings.mktChannels"),
    getLocale() as Promise<Locale>,
    prisma.mktChannelConnection.findMany({
      select: { channel: true, targetId: true, targetName: true, isActive: true, tokenExpiresAt: true, lastCheckAt: true, lastCheckOk: true, lastError: true },
    }),
  ]);
  const byChannel = new Map(rows.map((r) => [r.channel, r]));
  const cryptoOn = isChannelCryptoConfigured();

  const views: ChannelView[] = MKT_CHANNELS.map((ch) => {
    const r = byChannel.get(ch);
    return {
      channel: ch,
      connected: !!r,
      targetId: r?.targetId ?? "",
      targetName: r?.targetName ?? null,
      isActive: r?.isActive ?? true,
      tokenExpiresAt: r?.tokenExpiresAt ? r.tokenExpiresAt.toISOString().slice(0, 10) : null,
      lastCheckAt: r?.lastCheckAt ? formatDateTime(r.lastCheckAt, locale) : null,
      lastCheckOk: r?.lastCheckOk ?? null,
      lastError: r?.lastError ?? null,
    };
  });

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      {!cryptoOn && (
        <div className="rounded-xl border border-danger/40 bg-danger-bg p-3 text-xs text-danger">
          <ShieldAlert className="mr-1 inline h-4 w-4" />
          {t("noSecretBanner")}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted-foreground">{t("howTo")}</div>

      {views.map((v) => (
        <ChannelCard key={v.channel} view={v} cryptoOn={cryptoOn} />
      ))}

      <p className="text-[11px] text-muted-foreground">{t("footnote", { today: formatDate(new Date()) })}</p>
    </div>
  );
}
