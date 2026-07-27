import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { formatNumber } from "@/lib/utils";
import { loadQuotationSource, buildQuotationModel, type QuotationRow } from "@/lib/costsheet-export";
import { requirePermission } from "@/lib/permissions";
import type { Locale } from "@/i18n/locales";
import { PrintButton } from "./print-button";

/**
 * Bản in báo giá (A4) — Ctrl+P / nút In → "Save as PDF" là có file PDF gửi khách, KHÔNG cần thư
 * viện PDF nào. Render từ CÙNG buildQuotationModel với file Excel nên hai bản không bao giờ lệch số.
 * ?mode=client (mặc định) | internal.
 */
export default async function CostSheetPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  await requirePermission("bidding.view");
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const mode = modeParam === "internal" ? "internal" : "client";

  const [t, locale, src] = await Promise.all([
    getTranslations("projects.coce"),
    getLocale() as Promise<Locale>,
    loadQuotationSource(id),
  ]);
  if (!src) notFound();
  const m = buildQuotationModel(src, mode);
  const moneyCls = "text-right tabular-nums whitespace-nowrap";

  const renderRows = (rows: QuotationRow[]) =>
    rows.map((r, i) =>
      r.kind === "section" ? (
        <tr key={`s${i}`} className={r.depth === 1 ? "bg-neutral-100 font-bold" : "bg-neutral-50 font-semibold"}>
          <td colSpan={m.columns.length - (r.subtotal != null ? 2 : 0)} className="border border-neutral-400 px-2 py-1" style={{ paddingLeft: `${8 + (r.depth - 1) * 16}px` }}>
            {r.label}
          </td>
          {r.subtotal != null && (
            <>
              <td className={`border border-neutral-400 px-2 py-1 font-bold ${moneyCls}`}>{formatNumber(r.subtotal, locale)}</td>
              <td className="border border-neutral-400 px-2 py-1" />
            </>
          )}
        </tr>
      ) : (
        <tr key={`l${i}`}>
          <td className="border border-neutral-400 px-2 py-1 text-center">{r.stt}</td>
          {m.mode === "internal" && <td className="border border-neutral-400 px-2 py-1">{r.itemCode ?? ""}</td>}
          <td className="border border-neutral-400 px-2 py-1" style={{ paddingLeft: `${8 + (r.depth - 1) * 12}px` }}>
            {r.name}
          </td>
          <td className="border border-neutral-400 px-2 py-1 whitespace-pre-wrap">{r.specs ?? ""}</td>
          <td className="border border-neutral-400 px-2 py-1 text-center">{r.unit ?? ""}</td>
          <td className={`border border-neutral-400 px-2 py-1 ${moneyCls}`}>{r.qty ?? ""}</td>
          <td className={`border border-neutral-400 px-2 py-1 ${moneyCls}`}>{r.unitPrice != null ? formatNumber(r.unitPrice, locale) : ""}</td>
          <td className={`border border-neutral-400 px-2 py-1 ${moneyCls}`}>{formatNumber(r.total, locale)}</td>
          {m.mode === "internal" && <td className="border border-neutral-400 px-2 py-1 text-center">{r.taxLabel ?? ""}</td>}
          <td className="border border-neutral-400 px-2 py-1">{r.note ?? ""}</td>
        </tr>
      ),
    );

  const headerRow = (
    <tr>
      {m.columns.map((c) => (
        <th key={c} className="border border-neutral-400 bg-neutral-200 px-2 py-1.5 text-center font-semibold">
          {c}
        </th>
      ))}
    </tr>
  );

  return (
    // Nền trắng chữ đen cố định cho bản in — không theo dark mode.
    <div className="min-h-screen bg-white text-black">
      {/* Thanh công cụ — biến mất khi in */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-6 py-3 print:hidden">
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/projects/${id}/co-ce`} className="text-brand-600 hover:underline">
            ← {t("printBack")}
          </Link>
          <span className="text-neutral-500">{m.title}</span>
          <Link
            href={`/projects/${id}/co-ce/print?mode=${mode === "client" ? "internal" : "client"}`}
            className="text-brand-600 hover:underline"
          >
            {mode === "client" ? t("printSwitchInternal") : t("printSwitchClient")}
          </Link>
        </div>
        <PrintButton />
      </div>

      <div id="costsheet-print-area" className="mx-auto max-w-[1100px] px-8 py-6 text-[12px] leading-snug print:max-w-none print:px-0 print:py-0">
        {/* Đầu trang công ty */}
        <div className="mb-4">
          <p className="text-[15px] font-bold">{m.company.name}</p>
          {m.company.address && <p>{m.company.address}</p>}
          {(m.company.taxCode || m.company.phone || m.company.email) && (
            <p className="text-neutral-600">
              {[m.company.taxCode && `MST: ${m.company.taxCode}`, m.company.phone && `ĐT: ${m.company.phone}`, m.company.email]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>

        <h1 className="text-center text-xl font-bold uppercase">{m.title}</h1>
        <p className="text-center">{m.projectCode} — {m.projectName}</p>
        <p className="mb-4 text-center text-neutral-600">{m.dateLabel}</p>

        <div className="mb-3">
          <p className="font-semibold">Kính gửi: {m.clientName}</p>
          {m.clientAddress && <p>Địa chỉ: {m.clientAddress}</p>}
          {m.clientTaxCode && <p>MST: {m.clientTaxCode}</p>}
        </div>

        <table className="w-full border-collapse">
          <thead>{headerRow}</thead>
          <tbody>{renderRows(m.rows)}</tbody>
        </table>

        {m.proxyRows.length > 0 && (
          <>
            <p className="mt-4 mb-1 font-bold">KHOẢN CHI HỘ (ngoài giá trị báo giá — thanh toán theo thực tế)</p>
            <table className="w-full border-collapse">
              <thead>{headerRow}</thead>
              <tbody>{renderRows(m.proxyRows)}</tbody>
            </table>
          </>
        )}

        <div className="mt-4 ml-auto w-full max-w-md">
          {m.footer.map((f) => (
            <div key={f.label} className={`flex items-baseline justify-between gap-4 py-0.5 ${f.strong ? "border-t border-neutral-400 text-[13px] font-bold" : ""}`}>
              <span>{f.label}</span>
              {f.amount != null && <span className={moneyCls}>{formatNumber(f.amount, locale)}</span>}
            </div>
          ))}
        </div>

        {m.marginOverrideNote && <p className="mt-3 italic">Lý do duyệt margin dưới sàn: {m.marginOverrideNote}</p>}

        <div className="mt-4 space-y-0.5 text-[10px] italic text-neutral-600">
          {m.notes.map((n) => (
            <p key={n}>• {n}</p>
          ))}
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 text-center">
          {m.signatures.map((s) => (
            <div key={s}>
              <p className="font-bold">{s}</p>
              <p className="text-[10px] italic text-neutral-600">(Ký, ghi rõ họ tên)</p>
              <div className="h-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
