"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Link2, Copy, Check, Ban, Upload, Sparkles, FileSpreadsheet, Send, XCircle, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import { quoteTotalsOf, type RfqTemplate } from "@/lib/rfq-templates";
import { RFQ_FILE_MIME_TYPES, MAX_RFQ_FILE_BYTES } from "@/lib/rfq";
import { QuoteForm, type QuoteFormInitial } from "@/components/rfq/quote-form";
import type { Locale } from "@/i18n/locales";
import {
  issueRfq,
  cancelRfq,
  issueVendorToken,
  revokeVendorToken,
  saveVendorQuoteManual,
  markVendorDeclined,
  uploadVendorQuoteFile,
  parseVendorQuoteWithAi,
  type RfqFormState,
} from "../actions";

export type RfqDetailData = {
  id: string;
  code: string;
  title: string;
  status: string;
  note: string | null;
  deadline: string | null;
  templateCode: string;
  lines: { id: string; itemName: string; specs: string | null; unit: string | null; quantity: number; refUnitPrice: number | null }[];
  vendors: {
    id: string;
    vendorId: string;
    vendorName: string;
    vendorCode: string;
    status: string;
    submittedAt: string | null;
    submittedVia: string | null;
    hasToken: boolean;
    tokenExpiresAt: string | null;
    fileName: string | null;
    hasFile: boolean;
    terms: Record<string, unknown>;
    note: string | null;
    quoteLines: { rfqLineId: string; unitPrice: number; quantity: number | null; amount: number; extra: Record<string, unknown>; note: string | null }[];
  }[];
};

const ERR_KEY: Record<string, string> = {
  NOT_FOUND: "errNotFound",
  BAD_STATUS: "errBadStatus",
  NO_FILE: "errNoFile",
  BAD_TYPE: "errBadType",
  TOO_BIG: "errTooBig",
  UNREADABLE: "errUnreadable",
  NO_AI_PERM: "errNoAiPerm",
  NO_PRICE: "errNoPrice",
  NO_TEMPLATE: "errGeneric",
};

const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50";
const btnPrimary = "inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50";

export function RfqDetail({ data, template, canManage, canAi, locale }: { data: RfqDetailData; template: RfqTemplate; canManage: boolean; canAi: boolean; locale: Locale }) {
  const t = useTranslations("purchasing.rfq");
  const open = data.status === "SENT" || data.status === "COMPARING";

  return (
    <div className="space-y-4">
      {/* Điều khiển RFQ */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          {data.status === "DRAFT" && (
            <form action={issueRfq.bind(null, data.id)}>
              <button type="submit" className={btnPrimary}>
                <Send className="h-3.5 w-3.5" /> {t("sendBtn")}
              </button>
              <span className="ml-2 text-[11px] text-muted-foreground">{t("sendHint")}</span>
            </form>
          )}
          <a href={`/api/rfq/${data.id}/template.xlsx`} className={btn}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> {t("exportTemplateBtn")}
          </a>
          {data.status !== "CANCELED" && data.status !== "CONFIRMED" && (
            <form
              action={cancelRfq.bind(null, data.id)}
              onSubmit={(e) => {
                if (!window.confirm(t("cancelConfirm"))) e.preventDefault();
              }}
              className="ml-auto"
            >
              <button type="submit" className={btn + " text-danger"}>
                <XCircle className="h-3.5 w-3.5" /> {t("cancelBtn")}
              </button>
            </form>
          )}
        </div>
      )}
      {!open && data.status !== "DRAFT" && <p className="text-xs text-muted-foreground">{t("reopenHint")}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t("vendorsSectionTitle")}</h2>
        {data.vendors.map((rv) => (
          <VendorCard key={rv.id} rv={rv} data={data} template={template} canManage={canManage} canAi={canAi} open={open} locale={locale} />
        ))}
      </section>

    </div>
  );
}

function VendorCard({
  rv,
  data,
  template,
  canManage,
  canAi,
  open,
  locale,
}: {
  rv: RfqDetailData["vendors"][number];
  data: RfqDetailData;
  template: RfqTemplate;
  canManage: boolean;
  canAi: boolean;
  open: boolean;
  locale: Locale;
}) {
  const t = useTranslations("purchasing.rfq");
  const [mode, setMode] = useState<"view" | "manual" | "upload">("view");
  const [tokenState, tokenAction, tokenPending] = useActionState<RfqFormState, FormData>(issueVendorToken.bind(null, rv.id), {});
  const [copied, setCopied] = useState(false);
  // Hai con số KHÁC NHAU, phải hiện cả hai: PUR so sánh trên giá TRƯỚC thuế (VAT khấu trừ), còn
  // số NCC đòi thanh toán là số ĐÃ gồm thuế. Chỉ hiện một số là người đọc hiểu nhầm ngay.
  const totals = quoteTotalsOf(rv.quoteLines, rv.terms);
  const tone = rv.status === "SUBMITTED" ? "success" : rv.status === "DECLINED" ? "danger" : "warning";
  const link = tokenState.token && typeof window !== "undefined" ? `${window.location.origin}/rfq/${tokenState.token}` : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-foreground">{rv.vendorName}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{rv.vendorCode}</span>
        <Badge tone={tone}>{t(`rvStatus${rv.status}`)}</Badge>
        {rv.submittedAt && (
          <span className="text-[11px] text-muted-foreground">
            {formatDateTime(new Date(rv.submittedAt), locale)} · {t("submittedVia", { via: t(`via${rv.submittedVia ?? "MANUAL"}`) })}
          </span>
        )}
        {rv.status === "SUBMITTED" && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {t("quotedSubtotal")}: <span className="font-semibold text-foreground">{formatNumber(totals.subtotal, locale)}</span>
            {totals.taxTotal > 0 && (
              <>
                {" · "}
                {t("quotedTotal")}: <span className="text-sm font-bold text-foreground">{formatNumber(totals.total, locale)}</span>
              </>
            )}
          </span>
        )}
      </div>

      {rv.hasFile && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("lastFile")}:{" "}
          <a href={`/api/rfq-file/${rv.id}`} className="text-brand-600 hover:underline">
            {rv.fileName ?? "file"}
          </a>
        </p>
      )}

      {/* Bảng báo giá đã lưu (đọc) */}
      {rv.quoteLines.length > 0 && mode === "view" && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <tbody className="divide-y divide-border">
              {data.lines.map((l) => {
                const q = rv.quoteLines.find((x) => x.rfqLineId === l.id);
                return (
                  <tr key={l.id}>
                    <td className="py-1 pr-2 text-foreground">{l.itemName}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{q ? formatNumber(q.unitPrice, locale) : t("notQuoted")}</td>
                    <td className="py-1 pr-2 text-right tabular-nums font-medium">{q ? formatNumber(q.amount, locale) : "—"}</td>
                    <td className="py-1 pr-2 text-muted-foreground">
                      {q &&
                        Object.entries(q.extra)
                          .filter(([, v]) => v !== "" && v != null && v !== false)
                          .map(([k, v]) => `${k}=${String(v)}`)
                          .join(" · ")}
                      {q?.note && ` — ${q.note}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {Object.keys(rv.terms).length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("termsTitle")}:{" "}
              {Object.entries(rv.terms)
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(" · ")}
            </p>
          )}
          {rv.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{rv.note}</p>}
        </div>
      )}

      {/* Nút thao tác */}
      {canManage && open && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={tokenAction}>
            <button type="submit" disabled={tokenPending} className={btn}>
              <Link2 className="h-3.5 w-3.5" /> {t("makeLinkBtn")}
            </button>
          </form>
          {rv.hasToken && (
            <>
              <span className="text-[11px] text-muted-foreground">{rv.tokenExpiresAt ? t("linkExpires", { date: formatDate(new Date(rv.tokenExpiresAt)) }) : ""}</span>
              <form action={revokeVendorToken.bind(null, rv.id)}>
                <button type="submit" className={btn + " text-danger"}>
                  <Ban className="h-3.5 w-3.5" /> {t("revokeLinkBtn")}
                </button>
              </form>
            </>
          )}
          <button type="button" onClick={() => setMode(mode === "manual" ? "view" : "manual")} className={btn}>
            <Pencil className="h-3.5 w-3.5" /> {t("manualBtn")}
          </button>
          <button type="button" onClick={() => setMode(mode === "upload" ? "view" : "upload")} className={btn}>
            <Upload className="h-3.5 w-3.5" /> {t("uploadBtn")}
          </button>
          {rv.status !== "DECLINED" && (
            <form action={markVendorDeclined.bind(null, rv.id)} className="ml-auto">
              <button type="submit" className={btn + " text-muted-foreground"}>
                {t("declineBtn")}
              </button>
            </form>
          )}
        </div>
      )}
      {tokenState.error && <p className="mt-1 text-xs text-danger">{t(ERR_KEY[tokenState.error] ?? "errGeneric")}</p>}
      {link && (
        <div className="mt-2 rounded-lg border border-brand-400 bg-brand-50 p-2 text-xs">
          <p className="text-foreground">{t("linkReady", { vendor: rv.vendorName })}</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-surface px-2 py-1 font-mono text-[11px]">{link}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => setCopied(true));
              }}
              className={btn}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? t("copied") : t("copyBtn")}
            </button>
          </div>
        </div>
      )}

      {mode === "upload" && canManage && open && <UploadPanel rv={rv} data={data} template={template} canAi={canAi} locale={locale} onDone={() => setMode("view")} />}
      {mode === "manual" && canManage && open && <ManualPanel rv={rv} data={data} template={template} locale={locale} initial={initialFromSaved(rv)} via="MANUAL" onDone={() => setMode("view")} />}
    </div>
  );
}

function initialFromSaved(rv: RfqDetailData["vendors"][number]): QuoteFormInitial | null {
  if (rv.quoteLines.length === 0 && Object.keys(rv.terms).length === 0) return null;
  const lines: QuoteFormInitial["lines"] = {};
  for (const q of rv.quoteLines) lines[q.rfqLineId] = { unitPrice: q.unitPrice, quantity: q.quantity, extra: q.extra, note: q.note };
  return { lines, terms: rv.terms, vendorNote: rv.note };
}

function ManualPanel({
  rv,
  data,
  template,
  locale,
  initial,
  via,
  aiNote,
  onDone,
}: {
  rv: RfqDetailData["vendors"][number];
  data: RfqDetailData;
  template: RfqTemplate;
  locale: Locale;
  initial: QuoteFormInitial | null;
  via: "MANUAL" | "FILE";
  aiNote?: React.ReactNode;
  onDone: () => void;
}) {
  const t = useTranslations("purchasing.rfq");
  const [state, formAction, pending] = useActionState<RfqFormState, FormData>(saveVendorQuoteManual.bind(null, rv.id), {});
  if (state.success) {
    // Đã lưu — đóng panel, dữ liệu mới về qua revalidate.
    queueMicrotask(onDone);
  }
  return (
    <form action={formAction} className="mt-3 space-y-2 rounded-lg border border-dashed border-border-strong p-3">
      <input type="hidden" name="via" value={via} />
      <p className="text-xs font-semibold text-foreground">{t("quoteFormTitle", { vendor: rv.vendorName })}</p>
      <p className="text-[11px] text-muted-foreground">{t("quoteFormHint")}</p>
      {aiNote}
      <QuoteForm
        template={template}
        lines={data.lines}
        initial={initial}
        locale={locale}
        labels={{
          unitPrice: t("unitPrice"),
          amount: t("amount"),
          qtyQuoted: t("qtyQuoted"),
          lineNote: t("lineNote"),
          termsTitle: t("termsTitle"),
          subtotalLabel: t("quotedSubtotal"),
          totalLabel: t("quotedTotal"),
          inWordsLabel: t("quotedInWords"),
          lineHeader: t("colLine"),
          qtyHeader: t("colQty"),
          unitHeader: t("colUnit"),
          vendorNote: t("lineNote"),
        }}
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "..." : t("saveQuoteBtn")}
        </button>
        <button type="button" onClick={onDone} className={btn}>
          ✕
        </button>
        {state.error && <span className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</span>}
        {state.success && <span className="text-xs text-success">{t("quoteSaved")}</span>}
      </div>
    </form>
  );
}

function UploadPanel({
  rv,
  data,
  template,
  canAi,
  locale,
  onDone,
}: {
  rv: RfqDetailData["vendors"][number];
  data: RfqDetailData;
  template: RfqTemplate;
  canAi: boolean;
  locale: Locale;
  onDone: () => void;
}) {
  const t = useTranslations("purchasing.rfq");
  const [upState, upAction, upPending] = useActionState<RfqFormState, FormData>(uploadVendorQuoteFile.bind(null, rv.id), {});
  const [aiState, aiAction, aiPending] = useActionState<RfqFormState, FormData>(parseVendorQuoteWithAi.bind(null, rv.id), {});
  const parsed = aiState.parsed ?? upState.parsed ?? null;
  const parsedKey = parsed ? JSON.stringify(parsed).length + ":" + parsed.lines.length : "none";

  const initial: QuoteFormInitial | null = parsed
    ? {
        lines: Object.fromEntries(parsed.lines.map((l) => [l.rfqLineId, { unitPrice: l.unitPrice, quantity: l.quantity, extra: (l.extra ?? {}) as Record<string, unknown>, note: l.note ?? null }])),
        terms: (parsed.terms ?? {}) as Record<string, unknown>,
      }
    : null;
  const errState = aiState.error ? aiState : upState;

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-dashed border-border-strong p-3">
      <form
        action={upAction}
        onSubmit={(e) => {
          const fd = new FormData(e.currentTarget);
          if (fd.get("useAi") === "on" && !window.confirm(t("aiConfirm"))) e.preventDefault();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="file" name="file" accept={RFQ_FILE_MIME_TYPES.join(",")} required className="text-xs text-muted-foreground" />
        {canAi && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" name="useAi" defaultChecked className="h-3.5 w-3.5" /> <Sparkles className="h-3.5 w-3.5" /> {t("aiParseBtn")}
          </label>
        )}
        <button type="submit" disabled={upPending} className={btnPrimary}>
          <Upload className="h-3.5 w-3.5" /> {upPending ? "..." : t("uploadBtn")}
        </button>
        <span className="text-[11px] text-muted-foreground">≤ {Math.round(MAX_RFQ_FILE_BYTES / 1024 / 1024)}MB</span>
      </form>
      {rv.hasFile && canAi && !parsed && (
        <form
          action={aiAction}
          onSubmit={(e) => {
            if (!window.confirm(t("aiConfirm"))) e.preventDefault();
          }}
        >
          <button type="submit" disabled={aiPending} className={btn}>
            <Sparkles className="h-3.5 w-3.5" /> {aiPending ? "..." : t("aiParseBtn")}
          </button>
        </form>
      )}
      {errState.error && (
        <p className="text-xs text-danger">
          {errState.error === "AI_FAILED" ? t("errAi", { code: errState.errorCode ?? "UNKNOWN" }) : t(ERR_KEY[errState.error] ?? "errGeneric")}
        </p>
      )}
      {parsed && (
        <ManualPanel
          key={parsedKey}
          rv={rv}
          data={data}
          template={template}
          locale={locale}
          initial={initial}
          via="FILE"
          onDone={onDone}
          aiNote={
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning">
              <p>{t("aiFilled", { n: parsed.lines.filter((l) => l.unitPrice != null || l.amount != null).length })}</p>
              {parsed.unmatched.length > 0 && (
                <p className="mt-1">
                  {t("aiUnmatched")} {parsed.unmatched.map((u) => `${u.name ?? "?"}${u.amount != null ? ` (${formatNumber(u.amount, locale)})` : ""}`).join(" · ")}
                </p>
              )}
            </div>
          }
        />
      )}
    </div>
  );
}
