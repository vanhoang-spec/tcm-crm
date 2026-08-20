"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { QuoteForm, type QuoteFormInitial, type QuoteFormLine } from "@/components/rfq/quote-form";
import type { RfqTemplate } from "@/lib/rfq-templates";
import type { Locale } from "@/i18n/locales";
import { submitGuestQuote, declineGuestQuote, type GuestQuoteState } from "./actions";

const ERR_KEY: Record<string, string> = { NO_PRICE: "errNoPrice", INVALID: "invalidTitle", CLOSED: "closedTitle" };

export function GuestQuoteForm({
  token,
  template,
  lines,
  initial,
  locale,
  alreadySubmitted,
}: {
  token: string;
  template: RfqTemplate;
  lines: QuoteFormLine[];
  initial: QuoteFormInitial | null;
  locale: Locale;
  alreadySubmitted: boolean;
}) {
  const t = useTranslations("guest.rfq");
  const [state, formAction, pending] = useActionState<GuestQuoteState, FormData>(submitGuestQuote.bind(null, token), {});
  const [declineState, declineAction, declinePending] = useActionState<GuestQuoteState, FormData>(declineGuestQuote.bind(null, token), {});

  if (declineState.declined) {
    return <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground">{t("declined")}</div>;
  }
  if (state.success) {
    return (
      <div className="rounded-xl border border-success/40 bg-success/10 p-6 text-center">
        <h2 className="text-base font-bold text-foreground">{t("submittedTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("submittedBody")}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-3 h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
          {t("submitAgain")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <QuoteForm
          template={template}
          lines={lines}
          initial={initial}
          locale={locale}
          labels={{
            unitPrice: t("unitPrice"),
            amount: t("amount"),
            qtyQuoted: t("qtyQuoted"),
            lineNote: t("lineNote"),
            termsTitle: t("termsTitle"),
            subtotalLabel: t("subtotalLabel"),
            totalLabel: t("totalLabel"),
            inWordsLabel: t("inWordsLabel"),
            lineHeader: t("lineHeader"),
            qtyHeader: locale === "en" ? "Qty" : "SL",
            unitHeader: locale === "en" ? "Unit" : "ĐVT",
            vendorNote: t("lineNote"),
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="h-10 rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {pending ? "..." : alreadySubmitted ? t("submitAgain") : t("submitBtn")}
          </button>
          {state.error && <span className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</span>}
        </div>
      </form>
      {!alreadySubmitted && (
        <form
          action={declineAction}
          onSubmit={(e) => {
            if (!window.confirm(t("declineConfirm"))) e.preventDefault();
          }}
          className="text-right"
        >
          <button type="submit" disabled={declinePending} className="text-xs text-muted-foreground hover:text-danger">
            {t("declineBtn")}
          </button>
        </form>
      )}
    </div>
  );
}
