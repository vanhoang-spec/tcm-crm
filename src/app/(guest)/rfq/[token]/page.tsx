import { getLocale, getTranslations } from "next-intl/server";
import { loadRfqByToken } from "@/lib/rfq-server";
import { resolveRfqTemplate, parseExtraJson } from "@/lib/rfq-templates";
import { RFQ_OPEN_FOR_QUOTES } from "@/lib/rfq";
import { formatDate, formatDateTime, toNum } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { GuestQuoteForm } from "./guest-quote-form";
import type { QuoteFormInitial } from "@/components/rfq/quote-form";

/**
 * CỔNG NCC (PUR-1) — không đăng nhập, gác bằng token trong URL (sha256 lưu DB, khuôn GuestInvite).
 * Chỉ hiện đúng thứ NCC cần: dòng hỏi giá + form theo mẫu + báo giá chính họ đã gửi. KHÔNG hiện giá
 * CO tham chiếu, KHÔNG hiện NCC khác. Token hết hạn / thu hồi / RFQ đóng → thông báo, không form.
 */
export default async function GuestRfqPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [t, locale, rv] = await Promise.all([getTranslations("guest.rfq"), getLocale() as Promise<Locale>, loadRfqByToken(token)]);

  if (!rv) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <h1 className="text-lg font-bold text-foreground">{t("invalidTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("invalidBody")}</p>
      </div>
    );
  }
  const template = resolveRfqTemplate(rv.rfq.groupCode);
  const open = (RFQ_OPEN_FOR_QUOTES as readonly string[]).includes(rv.rfq.status);
  if (!template || !open) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <h1 className="text-lg font-bold text-foreground">{t("closedTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("closedBody")}</p>
      </div>
    );
  }

  const initial: QuoteFormInitial | null =
    rv.quoteLines.length > 0
      ? {
          lines: Object.fromEntries(rv.quoteLines.map((q) => [q.rfqLineId, { unitPrice: toNum(q.unitPrice), quantity: q.quantity, extra: parseExtraJson(q.extraJson), note: q.note }])),
          terms: parseExtraJson(rv.termsJson),
          vendorNote: rv.note,
        }
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-5">
        <h1 className="text-lg font-bold text-foreground">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("intro", { vendor: rv.vendor.name, project: `${rv.rfq.project.code} — ${rv.rfq.project.name}` })}</p>
        <p className="mt-1 text-sm font-medium text-foreground">{rv.rfq.title}</p>
        {rv.rfq.note && <p className="mt-1 text-xs text-muted-foreground">{rv.rfq.note}</p>}
        {rv.rfq.deadline && <p className="mt-1 text-xs text-warning">{t("deadline", { date: formatDate(rv.rfq.deadline) })}</p>}
        {rv.status === "SUBMITTED" && rv.submittedAt && <p className="mt-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">{t("alreadySubmitted", { at: formatDateTime(rv.submittedAt, locale) })}</p>}
        {rv.status === "DECLINED" && <p className="mt-2 text-xs text-muted-foreground">{t("declined")}</p>}
      </div>

      <GuestQuoteForm
        token={token}
        template={template}
        lines={rv.rfq.lines}
        initial={initial}
        locale={locale}
        alreadySubmitted={rv.status === "SUBMITTED"}
      />
    </div>
  );
}
