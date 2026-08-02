"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Check, Undo2, X } from "lucide-react";
import { NumberField } from "@/components/ui/number-field";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDate } from "@/lib/utils";
import { MONTHS, spendTotal } from "@/lib/overhead";
import type { Locale } from "@/i18n/locales";
import type { OverheadSpendRow } from "@/lib/overhead-data";
import { createSpend, markSpendPaid, unmarkSpendPaid, cancelSpend, type OverheadState } from "../actions";

type ItemOption = { id: string; pidCode: string; name: string; actualSource: string };

function useErr() {
  const t = useTranslations("overhead");
  return (code?: string) => (code ? t(`err${code}` as "errGeneric") : null);
}

export function CreateSpendForm({ fiscalYear, items, canOverBudget }: { fiscalYear: number; items: ItemOption[]; canOverBudget: boolean }) {
  const t = useTranslations("overhead");
  const locale = useLocale() as Locale;
  const err = useErr();
  const action = createSpend.bind(null, fiscalYear);
  const [state, formAction, pending] = useActionState<OverheadState, FormData>(action, {});
  const [open, setOpen] = useState(false);
  // ⚠ Hai ô CHỮ này phải là CONTROLLED. React 19 gọi `requestFormReset` sau MỌI lần chạy form action
  // — kể cả khi action TRẢ LỖI — nên ô uncontrolled bị xoá trắng. Đường lỗi hay gặp nhất ở đây là
  // "vượt ngân sách, phải nhập giải trình": người dùng gõ xong nội dung chi, bị chặn, rồi mất luôn
  // nội dung vừa gõ. Đã tái hiện trên browser trước khi sửa (ô về ""). Cùng bẫy đã vá ở KB-H2 mục (c).
  // Các ô tiền dùng NumberField ở chế độ điều khiển nên vốn đã an toàn.
  const [name, setName] = useState("");
  const [overNote, setOverNote] = useState("");
  const [net, setNet] = useState(0);
  const [vat, setVat] = useState(0);
  const [tncn, setTncn] = useState(0);
  const [tndn, setTndn] = useState(0);

  // Hệ quả của việc chuyển sang controlled: lưu XONG thì phải tự dọn form, không thì người nhập
  // khoản thứ hai sẽ thấy nguyên nội dung khoản vừa lưu và dễ bấm Lưu lần nữa thành bản ghi trùng.
  // Dọn bằng mẫu "điều chỉnh state lúc render" chứ KHÔNG dùng useEffect: React chạy lại ngay trước
  // khi vẽ nên không có nháy hình, và eslint chặn setState trong effect vì gây render dây chuyền.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.success) {
      setName("");
      setOverNote("");
      setNet(0);
      setVat(0);
      setTncn(0);
      setTndn(0);
    }
  }

  // Khoản lương lấy số từ Payroll — không cho chọn ở đây thay vì để server báo lỗi sau khi gõ xong.
  const options = items.filter((i) => i.actualSource !== "PAYROLL").map((i) => ({ value: i.id, label: `${i.pidCode} — ${i.name}` }));
  const total = spendTotal(net, vat, tncn, tndn);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Plus className="h-4 w-4" />
        {t("newSpend")}
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-[11px] text-muted-foreground lg:col-span-2">
          {t("spendItem")}
          <SearchableSelect name="itemId" options={options} required className="mt-1" />
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("spendMonth")}
          <select name="month" defaultValue={new Date().getMonth() + 1} className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm">
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {t("monthN", { n: m })}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("spendExpectedDate")}
          <DateField name="expectedDate" className="mt-1" />
        </label>
        <label className="text-[11px] text-muted-foreground lg:col-span-2">
          {t("spendName")}
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm"
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("spendNet")}
          <NumberField name="amountNet" value={net} onChange={setNet} className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("spendVat")}
          <NumberField name="vat" value={vat} onChange={setVat} className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("spendTncn")}
          <NumberField name="tncn" value={tncn} onChange={setTncn} className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("spendTndn")}
          <NumberField name="tndn" value={tndn} onChange={setTndn} className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
        </label>
        <div className="lg:col-span-2">
          <p className="text-[11px] text-muted-foreground">{t("spendTotal")}</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatNumber(total, locale)}đ</p>
          <p className="text-[10px] text-muted-foreground">{t("spendTotalHint")}</p>
        </div>
      </div>

      {canOverBudget && (
        <label className="block text-[11px] text-muted-foreground">
          {t("overBudgetNote")}
          <input
            name="overBudgetNote"
            value={overNote}
            onChange={(e) => setOverNote(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm"
          />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {pending ? "..." : t("save")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-border-strong px-3 text-sm hover:bg-surface-2">
          {t("importCancel")}
        </button>
        {err(state.error) && <span className="text-xs text-danger">{err(state.error)}</span>}
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────

export function SpendTable({ rows, canPay, canRecord }: { rows: OverheadSpendRow[]; canPay: boolean; canRecord: boolean }) {
  const t = useTranslations("overhead");
  const locale = useLocale() as Locale;
  const money = (n: number) => `${formatNumber(n, locale)}đ`;

  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">{t("emptySpends")}</p>;
  }

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{t("spendMonth")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("colPid")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("spendName")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("spendNet")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("spendTotal")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("colStatus")}</th>
            <th className="px-3 py-2 text-left font-medium w-56">{t("colActions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <SpendRow key={r.id} row={r} money={money} canPay={canPay} canRecord={canRecord} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpendRow({ row, money, canPay, canRecord }: { row: OverheadSpendRow; money: (n: number) => string; canPay: boolean; canRecord: boolean }) {
  const t = useTranslations("overhead");
  const err = useErr();
  const [mode, setMode] = useState<"none" | "reverse" | "cancel">("none");

  const [pState, pAction, pPending] = useActionState<OverheadState, FormData>(markSpendPaid.bind(null, row.id), {});
  const [rState, rAction, rPending] = useActionState<OverheadState, FormData>(unmarkSpendPaid.bind(null, row.id), {});
  const [cState, cAction, cPending] = useActionState<OverheadState, FormData>(cancelSpend.bind(null, row.id), {});

  // ⚠ ĐỪNG gộp 3 lỗi bằng `??`. Ba useActionState giữ lỗi RIÊNG và KHÔNG tự xoá cho nhau, nên lỗi cũ
  // của thao tác này che mất lỗi mới của thao tác kia. Đã tái hiện: double-click "Thanh toán" để lại
  // "đã thanh toán rồi", sau đó bấm Đảo mà bỏ trống lý do thì màn hình vẫn hiện câu CŨ — người dùng
  // đọc xong không hiểu vì sao không đảo được. Mỗi ô lỗi chỉ hiện khi đúng thao tác đó đang mở.
  const modeErr = mode === "reverse" ? err(rState.error) : mode === "cancel" ? err(cState.error) : err(pState.error);

  // Đảo / huỷ xong thì đóng ô lý do, không thì form còn mở với chữ vừa gõ và dễ bấm lần hai.
  const [seen, setSeen] = useState<[OverheadState, OverheadState]>([rState, cState]);
  if (seen[0] !== rState || seen[1] !== cState) {
    setSeen([rState, cState]);
    if (rState.success || cState.success) setMode("none");
  }

  return (
    <>
      <tr className={row.status === "CANCELED" ? "opacity-50" : undefined}>
        <td className="px-3 py-2 text-[11px] text-muted-foreground">{t("monthN", { n: row.month })}</td>
        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{row.pidCode}</td>
        <td className="px-3 py-2">
          <span className="text-foreground">{row.name}</span>
          <span className="block text-[10px] text-muted-foreground">{row.itemName}</span>
          {row.overBudgetNote && <span className="block text-[10px] text-warning">⚠ {row.overBudgetNote}</span>}
          {row.reverseNote && <span className="block text-[10px] text-muted-foreground">↩ {row.reverseNote}</span>}
          {row.cancelNote && <span className="block text-[10px] text-muted-foreground">✕ {row.cancelNote}</span>}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(row.amountNet)}</td>
        <td className="px-3 py-2 text-right tabular-nums font-medium">{money(row.amountTotal)}</td>
        <td className="px-3 py-2">
          <Badge tone={row.status === "PAID" ? "success" : row.status === "CANCELED" ? "neutral" : "warning"}>
            {t(`spend${row.status}` as "spendPAID")}
          </Badge>
          {row.paidDate && <span className="block text-[10px] text-muted-foreground">{formatDate(row.paidDate)}</span>}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {canPay && row.status === "SCHEDULED" && (
              <form action={pAction}>
                <button type="submit" disabled={pPending} className="inline-flex h-7 items-center gap-1 rounded-md bg-success px-2 text-[11px] font-medium text-white disabled:opacity-50">
                  <Check className="h-3 w-3" />
                  {pPending ? "..." : t("markPaid")}
                </button>
              </form>
            )}
            {canPay && row.status === "PAID" && (
              <button type="button" onClick={() => setMode(mode === "reverse" ? "none" : "reverse")} className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong px-2 text-[11px] hover:bg-surface-2">
                <Undo2 className="h-3 w-3" />
                {t("unmarkPaid")}
              </button>
            )}
            {canRecord && row.status === "SCHEDULED" && (
              <button type="button" onClick={() => setMode(mode === "cancel" ? "none" : "cancel")} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-danger hover:underline">
                <X className="h-3 w-3" />
                {t("cancel")}
              </button>
            )}
            {modeErr && <span className="text-[10px] text-danger">{modeErr}</span>}
          </div>
        </td>
      </tr>
      {mode !== "none" && (
        <tr>
          <td colSpan={7} className="bg-surface-2/50 px-3 py-2">
            <form action={mode === "reverse" ? rAction : cAction} className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-muted-foreground">
                {mode === "reverse" ? t("reverseNote") : t("cancelNote")}
                <input
                  name={mode === "reverse" ? "reverseNote" : "cancelNote"}
                  className="mt-1 h-8 w-80 rounded-md border border-border-strong bg-surface px-2 text-xs"
                />
              </label>
              <button
                type="submit"
                disabled={mode === "reverse" ? rPending : cPending}
                className="h-8 rounded-md bg-danger px-3 text-xs font-medium text-white disabled:opacity-50"
              >
                {t("confirm")}
              </button>
              <button type="button" onClick={() => setMode("none")} className="text-[11px] text-muted-foreground hover:underline">
                {t("importCancel")}
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
