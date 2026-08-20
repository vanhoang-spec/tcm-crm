"use client";

import { useMemo, useState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { formatNumber } from "@/lib/utils";
import { computeQuoteLineAmount, quoteTotalsOf, type RfqTemplate } from "@/lib/rfq-templates";
import { amountInWordsVi } from "@/lib/number-words";
import type { Locale } from "@/i18n/locales";

export type QuoteFormLine = { id: string; itemName: string; specs: string | null; unit: string | null; quantity: number };
export type QuoteFormInitial = {
  lines: Record<string, { unitPrice: number | null; quantity: number | null; extra: Record<string, unknown>; note: string | null }>;
  terms: Record<string, unknown>;
  vendorNote?: string | null;
};
export type QuoteFormLabels = {
  unitPrice: string;
  amount: string;
  qtyQuoted: string;
  lineNote: string;
  termsTitle: string;
  subtotalLabel: string;
  /** Tổng THANH TOÁN (đã gồm thuế). */
  totalLabel: string;
  inWordsLabel: string;
  lineHeader: string;
  qtyHeader: string;
  unitHeader: string;
  vendorNote: string;
};

type RowState = { unitPrice: number | null; quantity: number | null; extra: Record<string, unknown>; note: string };

const cell = "h-8 w-full rounded border border-border-strong bg-surface px-1.5 text-xs outline-none focus:border-brand-400";

/**
 * FORM BÁO GIÁ THEO MẪU — dùng chung cho cổng NCC (guest), PUR nhập hộ, và PUR duyệt kết quả AI.
 * Thành tiền tính realtime bằng ĐÚNG hàm server sẽ dùng (computeQuoteLineAmount) nên NCC nhìn thấy
 * số y hệt số sẽ lưu. Tên field theo hợp đồng của parseQuoteFormData: `<lineId>_unitPrice`, `_qty`,
 * `_note`, `_x_<key>`, `term_<key>`, `vendorNote`. Ô chữ controlled (bẫy requestFormReset của React 19).
 *
 * Truyền `key` từ ngoài để dựng lại khi initial đổi (AI vừa điền) — state khởi tạo từ prop không tự chạy lại.
 */
export function QuoteForm({
  template,
  lines,
  initial,
  labels,
  locale,
  readOnly = false,
}: {
  template: RfqTemplate;
  lines: QuoteFormLine[];
  initial: QuoteFormInitial | null;
  labels: QuoteFormLabels;
  locale: Locale;
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const out: Record<string, RowState> = {};
    for (const l of lines) {
      const init = initial?.lines[l.id];
      const extra: Record<string, unknown> = { ...(init?.extra ?? {}) };
      for (const c of template.lineColumns) if (extra[c.key] === undefined && c.defaultValue !== undefined) extra[c.key] = c.defaultValue;
      out[l.id] = { unitPrice: init?.unitPrice ?? null, quantity: init?.quantity ?? null, extra, note: init?.note ?? "" };
    }
    return out;
  });
  const [terms, setTerms] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const tf of template.terms) {
      const v = initial?.terms?.[tf.key];
      out[tf.key] = v == null ? "" : String(v);
    }
    return out;
  });
  const [vendorNote, setVendorNote] = useState(initial?.vendorNote ?? "");

  const amounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lines) {
      const r = rows[l.id];
      m[l.id] = computeQuoteLineAmount(template, { quantity: r.quantity ?? l.quantity, unitPrice: r.unitPrice ?? 0, extra: r.extra });
    }
    return m;
  }, [rows, lines, template]);
  // Σ → tiền thuế theo từng mức → tổng thanh toán. Dùng ĐÚNG hàm server dùng, nên NCC nhìn thấy
  // số y hệt số sẽ lưu; mức thuế lấy từ điều khoản, dòng nào khai riêng thì dòng đó thắng.
  const totals = useMemo(
    () => quoteTotalsOf(lines.map((l) => ({ amount: amounts[l.id] || 0, extra: rows[l.id]?.extra })), terms),
    [lines, amounts, rows, terms],
  );
  const cl = (c: { labelVi: string; labelEn: string }) => (locale === "en" ? c.labelEn : c.labelVi);
  const hint = (c: { hintVi?: string; hintEn?: string }) => (locale === "en" ? c.hintEn : c.hintVi);
  const setRow = (id: string, patch: Partial<RowState>) => setRows((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  const setExtra = (id: string, key: string, v: unknown) => setRows((s) => ({ ...s, [id]: { ...s[id], extra: { ...s[id].extra, [key]: v } } }));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
              <th className="py-1.5 pr-2">#</th>
              <th className="py-1.5 pr-2">{labels.lineHeader}</th>
              <th className="py-1.5 pr-2 text-right">{labels.qtyHeader}</th>
              <th className="py-1.5 pr-2">{labels.unitHeader}</th>
              {template.lineColumns.map((c) => (
                <th key={c.key} className="py-1.5 pr-2">
                  {cl(c)}
                </th>
              ))}
              <th className="py-1.5 pr-2 text-right">{locale === "en" ? template.unitPriceLabelEn : template.unitPriceLabelVi}</th>
              <th className="py-1.5 pr-2 text-right">{labels.qtyQuoted}</th>
              <th className="py-1.5 pr-2 text-right">{labels.amount}</th>
              <th className="py-1.5 pr-2">{labels.lineNote}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l, i) => {
              const r = rows[l.id];
              return (
                <tr key={l.id} className="align-top">
                  <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 pr-2">
                    <p className="font-medium text-foreground">{l.itemName}</p>
                    {l.specs && <p className="text-[11px] text-muted-foreground">{l.specs}</p>}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatNumber(l.quantity, locale)}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{l.unit ?? "—"}</td>
                  {template.lineColumns.map((c) => (
                    <td key={c.key} className="py-1.5 pr-2">
                      {c.type === "number" ? (
                        <NumberField
                          name={`${l.id}_x_${c.key}`}
                          value={typeof r.extra[c.key] === "number" ? (r.extra[c.key] as number) : null}
                          onChange={(v) => setExtra(l.id, c.key, v)}
                          decimals={2}
                          className={cell + " min-w-[70px]"}
                          disabled={readOnly}
                        />
                      ) : c.type === "bool" ? (
                        <input type="checkbox" name={`${l.id}_x_${c.key}`} checked={!!r.extra[c.key]} onChange={(e) => setExtra(l.id, c.key, e.target.checked)} className="mt-2 h-3.5 w-3.5" disabled={readOnly} />
                      ) : c.type === "select" ? (
                        <select name={`${l.id}_x_${c.key}`} value={String(r.extra[c.key] ?? "")} onChange={(e) => setExtra(l.id, c.key, e.target.value)} className={cell + " min-w-[80px]"} disabled={readOnly}>
                          <option value="">—</option>
                          {(c.options ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {locale === "en" ? o.labelEn : o.labelVi}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          name={`${l.id}_x_${c.key}`}
                          value={String(r.extra[c.key] ?? "")}
                          onChange={(e) => setExtra(l.id, c.key, e.target.value)}
                          className={cell + " min-w-[110px]"}
                          placeholder={hint(c)}
                          disabled={readOnly}
                        />
                      )}
                    </td>
                  ))}
                  <td className="py-1.5 pr-2">
                    <NumberField name={`${l.id}_unitPrice`} value={r.unitPrice} onChange={(v) => setRow(l.id, { unitPrice: v })} className={cell + " min-w-[110px] text-right"} disabled={readOnly} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <NumberField
                      name={`${l.id}_qty`}
                      value={r.quantity}
                      onChange={(v) => setRow(l.id, { quantity: v || null })}
                      decimals={2}
                      className={cell + " min-w-[70px] text-right"}
                      placeholder={String(l.quantity)}
                      disabled={readOnly}
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-medium text-foreground">{amounts[l.id] ? formatNumber(amounts[l.id], locale) : "—"}</td>
                  <td className="py-1.5 pr-2">
                    <input name={`${l.id}_note`} value={r.note} onChange={(e) => setRow(l.id, { note: e.target.value })} className={cell + " min-w-[120px]"} disabled={readOnly} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border">
              <td colSpan={4 + template.lineColumns.length + 2} className="py-2 pr-2 text-right text-xs text-muted-foreground">
                {labels.subtotalLabel}
              </td>
              <td className="py-2 pr-2 text-right text-sm tabular-nums text-foreground">{formatNumber(totals.subtotal, locale)}</td>
              <td />
            </tr>
            {totals.taxBreakdown.map((b) => (
              <tr key={b.label}>
                <td colSpan={4 + template.lineColumns.length + 2} className="py-1 pr-2 text-right text-xs text-muted-foreground">
                  {b.label}
                </td>
                <td className="py-1 pr-2 text-right text-sm tabular-nums text-foreground">{formatNumber(b.amount, locale)}</td>
                <td />
              </tr>
            ))}
            <tr className="border-t border-border">
              <td colSpan={4 + template.lineColumns.length + 2} className="py-2 pr-2 text-right text-xs font-semibold text-foreground">
                {labels.totalLabel}
              </td>
              <td className="py-2 pr-2 text-right text-sm font-bold tabular-nums text-foreground">{formatNumber(totals.total, locale)}</td>
              <td />
            </tr>
            {totals.total > 0 && (
              <tr>
                <td colSpan={4 + template.lineColumns.length + 4} className="py-1 pr-2 text-right text-[11px] italic text-muted-foreground">
                  {labels.inWordsLabel}: {amountInWordsVi(totals.total)}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {template.terms.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-foreground">{labels.termsTitle}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {template.terms.map((tf) => (
              <label key={tf.key} className="block">
                <span className="mb-0.5 block text-[11px] text-muted-foreground">{cl(tf)}</span>
                {tf.type === "textarea" ? (
                  <textarea
                    name={`term_${tf.key}`}
                    value={terms[tf.key]}
                    onChange={(e) => setTerms((s) => ({ ...s, [tf.key]: e.target.value }))}
                    rows={2}
                    className="w-full rounded border border-border-strong bg-surface px-1.5 py-1 text-xs outline-none focus:border-brand-400"
                    placeholder={hint(tf)}
                    disabled={readOnly}
                  />
                ) : (
                  <input
                    name={`term_${tf.key}`}
                    value={terms[tf.key]}
                    onChange={(e) => setTerms((s) => ({ ...s, [tf.key]: e.target.value }))}
                    className={cell}
                    placeholder={hint(tf)}
                    disabled={readOnly}
                    inputMode={tf.type === "number" ? "decimal" : undefined}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="block">
        <span className="mb-0.5 block text-[11px] text-muted-foreground">{labels.vendorNote}</span>
        <input name="vendorNote" value={vendorNote} onChange={(e) => setVendorNote(e.target.value)} className={cell} disabled={readOnly} />
      </label>
    </div>
  );
}
