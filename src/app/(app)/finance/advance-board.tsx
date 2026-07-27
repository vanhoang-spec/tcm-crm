"use client";

import { useActionState, useState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn, formatNumber, formatDate } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { requestAdvance, confirmAdvanceDisbursed, settleAdvance, cancelAdvance, reverseDisbursedAdvance, type FinanceFormState } from "./actions";

type Opt = { id: string; label: string };
type AdvanceData = {
  id: string;
  installmentNo: number;
  amount: number;
  advanceType: string;
  recipientName: string;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountHolder: string | null;
  status: string;
  requestedByName: string | null;
  disbursedByName: string | null;
  disbursedAt: Date | null;
  settledByName: string | null;
  settledAt: Date | null;
};
export type LineData = {
  id: string;
  /** Mã hiển thị của dòng chi phí (ACC-001…) — null khi hạng mục chưa gán phòng ban. */
  itemCode: string | null;
  sectionName: string;
  itemName: string;
  /** CO của dòng — ĐÃ gross-up thuế. Dùng để ĐỐI CHIẾU giá vốn, KHÔNG phải trần chi. */
  amount: number;
  /** Số THỰC TRẢ = trần cho mọi khoản chi ra của dòng (đã bóc gross-up TNCN/TNDN). */
  netAmount: number;
  /** Tạm ứng chưa huỷ — gộp cả 2 loại (NV giữ tiền + chuyển thẳng NCC). */
  advanced: number;
  /** Đã thanh toán NCC cho dòng này. */
  paid: number;
  /** = netAmount − advanced − paid. Âm = đã lỡ chi vượt (dữ liệu cũ trước khi siết trần). */
  remaining: number;
  isStale: boolean;
  vendorId: string | null;
  vendorLabel: string | null;
  vendors: Opt[];
  staff: Opt[];
  advances: AdvanceData[];
};

const STATUS_TONE: Record<string, "neutral" | "warning" | "success" | "brand" | "danger"> = {
  REQUESTED: "warning",
  DISBURSED: "brand",
  SETTLED: "success",
  CANCELED: "neutral",
};

export function AdvanceBoard({ lines }: { lines: LineData[] }) {
  const t = useTranslations("finance.advances");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        {/* Header */}
        <div className="grid grid-cols-[1.2fr_1.7fr_1fr_0.9fr_0.9fr_1fr_auto] gap-2 border-b border-border pb-1.5 text-[11px] font-medium text-muted-foreground">
          <span>{t("colSection")}</span>
          <span>{t("colItem")}</span>
          <span className="text-right">{t("colNetAmount")}</span>
          <span className="text-right">{t("colAdvanced")}</span>
          <span className="text-right">{t("colPaid")}</span>
          <span className="text-right">{t("colRemaining")}</span>
          <span className="w-20" />
        </div>

        {lines.map((line) => (
          <LineRow key={line.id} line={line} isOpen={open.has(line.id)} onToggle={() => toggle(line.id)} t={t} locale={locale} />
        ))}
      </div>
    </div>
  );
}

function LineRow({
  line,
  isOpen,
  onToggle,
  t,
  locale,
}: {
  line: LineData;
  isOpen: boolean;
  onToggle: () => void;
  t: (k: string, v?: Record<string, string | number>) => string;
  locale: Locale;
}) {
  return (
    <div className={cn("border-b border-border/60", line.isStale && "opacity-70")}>
      <div className="grid grid-cols-[1.2fr_1.7fr_1fr_0.9fr_0.9fr_1fr_auto] items-center gap-2 py-1.5 text-sm">
        <span className="truncate text-xs text-muted-foreground">{line.sectionName}</span>
        <span className="flex items-center gap-1 truncate text-foreground">
          <button type="button" onClick={onToggle} className="shrink-0 text-muted-foreground hover:text-foreground">
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {line.itemCode && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{line.itemCode}</span>}
          <span className="truncate">{line.itemName}</span>
          {line.isStale && <Badge tone="danger">{t("staleTag")}</Badge>}
          {line.remaining < 0 && <Badge tone="danger">{t("overAdvancedTag")}</Badge>}
        </span>
        {/* Cột giá trị = số THỰC TRẢ (trần chi). CO đã gross-up thuế để ở tooltip — hai số khác
            nhau ở dòng TNCN/TNDN, hiện nhầm số là cho chi vượt đúng bằng phần thuế. */}
        <span
          className="text-right tabular-nums text-foreground"
          title={line.netAmount !== line.amount ? t("netVsCoHint", { co: formatNumber(line.amount, locale) }) : undefined}
        >
          {formatNumber(line.netAmount, locale)}
          {line.netAmount !== line.amount && <span className="ml-0.5 text-[11px] text-muted-foreground">*</span>}
        </span>
        <span className="text-right tabular-nums text-muted-foreground">{formatNumber(line.advanced, locale)}</span>
        <span className="text-right tabular-nums text-muted-foreground">{formatNumber(line.paid, locale)}</span>
        <span className={cn("text-right tabular-nums font-medium", line.remaining <= 0 ? "text-muted-foreground" : "text-success")}>
          {formatNumber(line.remaining, locale)}
        </span>
        <span className="flex w-20 justify-end">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg bg-brand-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-600"
          >
            {t("advanceBtn")}
          </button>
        </span>
      </div>

      {isOpen && (
        <div className="mb-2 space-y-3 rounded-lg border border-border bg-surface-2/40 p-3">
          {/* Existing installments */}
          {line.advances.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">{t("installmentsTitle")}</p>
              {line.advances.map((a) => (
                <InstallmentCard key={a.id} adv={a} t={t} locale={locale} />
              ))}
            </div>
          )}

          {/* New advance form */}
          {line.remaining > 0 && !line.isStale && <NewAdvanceForm line={line} t={t} />}
        </div>
      )}
    </div>
  );
}

function InstallmentCard({
  adv,
  t,
  locale,
}: {
  adv: AdvanceData;
  t: (k: string, v?: Record<string, string | number>) => string;
  locale: Locale;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{t("installmentNo", { n: adv.installmentNo })}</span>
        <span className="tabular-nums text-foreground">{formatNumber(adv.amount, locale)}</span>
        <Badge tone={adv.advanceType === "VENDOR" ? "neutral" : "brand"}>
          {t(adv.advanceType === "VENDOR" ? "typeVendor" : "typeStaff")}
        </Badge>
        <span className="text-muted-foreground">→ {adv.recipientName}</span>
        <Badge tone={STATUS_TONE[adv.status] ?? "neutral"}>{t(`status${adv.status}`)}</Badge>
      </div>
      <p className="mt-1 text-muted-foreground">
        {adv.bankName} · {adv.bankAccountNo} · {adv.bankAccountHolder}
      </p>
      {adv.status === "DISBURSED" && adv.disbursedByName && (
        <p className="mt-0.5 text-success">{t("disbursedBy", { name: adv.disbursedByName, date: adv.disbursedAt ? formatDate(adv.disbursedAt) : "" })}</p>
      )}
      {adv.status === "SETTLED" && adv.settledByName && (
        <p className="mt-0.5 text-success">{t("settledBy", { name: adv.settledByName, date: adv.settledAt ? formatDate(adv.settledAt) : "" })}</p>
      )}
      {/* Kế toán actions */}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {adv.status === "REQUESTED" && (
          <>
            <form action={confirmAdvanceDisbursed.bind(null, adv.id)}>
              <button type="submit" className="inline-flex items-center gap-1 rounded border border-success/40 px-2 py-0.5 text-[11px] font-medium text-success hover:bg-success/10">
                <CheckCircle2 className="h-3 w-3" /> {t("confirmDisbursed")}
              </button>
            </form>
            <form action={cancelAdvance.bind(null, adv.id)}>
              <button type="submit" className="rounded border border-border-strong px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-surface-2">
                {t("cancelAdvance")}
              </button>
            </form>
          </>
        )}
        {adv.status === "DISBURSED" && (
          <>
            <form action={settleAdvance.bind(null, adv.id)} className="flex items-center gap-1">
              <input name="settleNote" placeholder={t("settleNote")} className="h-6 w-40 rounded border border-border-strong bg-surface px-1.5 text-[11px]" />
              <button type="submit" className="rounded border border-border-strong px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-surface-2">
                {t("settle")}
              </button>
            </form>
            {/* Khác "Hoàn ứng": hoàn ứng = NV đã quyết toán xong. Cái này = chi NHẦM, tiền đã thu
                hồi, trả lại trần chi cho dòng — nên bắt buộc có lý do. */}
            <ReverseDisbursedForm advanceId={adv.id} t={t} />
          </>
        )}
      </div>
    </div>
  );
}

function ReverseDisbursedForm({ advanceId, t }: { advanceId: string; t: (k: string, v?: Record<string, string | number>) => string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(
    reverseDisbursedAdvance.bind(null, advanceId),
    {},
  );

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded border border-border-strong px-2 py-0.5 text-[11px] text-muted-foreground hover:text-danger">
        {t("reverseBtn")}
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input name="cancelNote" placeholder={t("reverseNotePlaceholder")} className="h-6 w-48 rounded border border-border-strong bg-surface px-1.5 text-[11px]" />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-danger/40 px-2 py-0.5 text-[11px] font-medium text-danger hover:bg-danger-bg disabled:opacity-60"
      >
        {t("reverseBtn")}
      </button>
      {state.error && (
        <span className="text-[11px] text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}

function NewAdvanceForm({ line, t }: { line: LineData; t: (k: string, v?: Record<string, string | number>) => string }) {
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(requestAdvance.bind(null, line.id), {});
  const [type, setType] = useState<"VENDOR" | "STAFF">(line.vendorId ? "VENDOR" : "STAFF");

  const input = "h-8 w-full rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-dashed border-border-strong p-2.5">
      <p className="text-xs font-medium text-brand-600">{t("newInstallment")}</p>
      <input type="hidden" name="advanceType" value={type} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-[11px] text-muted-foreground">
          {t("colAmount")} (≤ {formatNumber(line.remaining, "vi")})
          <NumberField name="amount" placeholder={t("amountPlaceholder")} className={input} />
        </label>
        <div className="text-[11px] text-muted-foreground">
          {t("typeLabel")}
          <div className="mt-1 flex gap-2">
            {(["VENDOR", "STAFF"] as const).map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-1 rounded-lg border border-border-strong px-2 py-1 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50">
                <input type="radio" name="advanceTypeRadio" checked={type === v} onChange={() => setType(v)} />
                {t(v === "VENDOR" ? "typeVendor" : "typeStaff")}
              </label>
            ))}
          </div>
        </div>
      </div>

      {type === "VENDOR" ? (
        <label className="block text-[11px] text-muted-foreground">
          {t("recipientVendor")}
          <SearchableSelect
            name="recipientVendorId"
            defaultValue={line.vendorId ?? ""}
            placeholder={t("selectVendor")}
            options={line.vendors.map((v) => ({ value: v.id, label: v.label }))}
          />
        </label>
      ) : (
        <label className="block text-[11px] text-muted-foreground">
          {t("recipientStaff")}
          <SearchableSelect
            name="recipientStaffId"
            defaultValue=""
            placeholder={t("selectStaff")}
            options={line.staff.map((s) => ({ value: s.id, label: s.label }))}
          />
        </label>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input name="bankName" placeholder={t("bankName")} className={input} />
        <input name="bankAccountNo" placeholder={t("bankAccountNo")} className={input} />
        <input name="bankAccountHolder" placeholder={t("bankAccountHolder")} className={input} />
      </div>

      <button type="submit" disabled={pending} className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
        {t("submit")}
      </button>

      {state.error && <p className="text-xs text-danger">{state.error}</p>}
      {state.notice && <p className="rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">{t("hardCopyNotice")}</p>}
    </form>
  );
}
