import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { formatNumber } from "@/lib/utils";
import { loadQuotationSource, buildQuotationModel } from "@/lib/costsheet-export";
import type { QuotationRow } from "@/lib/costsheet-quotation";
import { requirePermission } from "@/lib/permissions";
import type { Locale } from "@/i18n/locales";
import { PrintButton } from "./print-button";

/**
 * Bản in báo giá theo form BM02/QT.TCM.15 (A4 dọc) — Ctrl+P / nút In → "Save as PDF" là có file
 * PDF gửi khách, KHÔNG cần thư viện PDF. Render từ CÙNG buildQuotationModel với file Excel nên hai
 * bản không bao giờ lệch số. ?mode=client (mặc định) | internal.
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
        <tr key={`s${i}`} className={r.depth === 1 ? "bg-[#FFF2CC] font-bold" : "bg-neutral-50 font-semibold"}>
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
          {/* Dòng "TCM hỗ trợ": Thành tiền ĐỂ TRỐNG (total=null) — đúng form thật. */}
          <td className={`border border-neutral-400 px-2 py-1 ${moneyCls}`}>{r.total != null ? formatNumber(r.total, locale) : ""}</td>
          {m.mode === "internal" && <td className="border border-neutral-400 px-2 py-1 text-center">{r.taxLabel ?? ""}</td>}
          <td className="border border-neutral-400 px-2 py-1 whitespace-pre-wrap">{r.note ?? ""}</td>
        </tr>
      ),
    );

  const headerRow = (
    <tr>
      {m.columns.map((c) => (
        <th key={c} className="border border-neutral-400 bg-neutral-600 px-2 py-1.5 text-center font-semibold text-white">
          {c}
        </th>
      ))}
    </tr>
  );

  return (
    // Nền trắng chữ đen cố định cho bản in — không theo dark mode.
    <div className="min-h-screen bg-white text-black">
      {/* A4 NGANG cho bản in (quyết định chủ dự án 05/08/2026, khớp file Excel) — bảng CE nhiều
          cột in dọc bị bóp chữ. Chỉ có tác dụng lúc in, không đổi gì trên màn hình. */}
      <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>
      {/* Thanh công cụ — biến mất khi in (nằm ngoài #costsheet-print-area) */}
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
        {/* Đầu trang: letterhead PNG (đủ tên EN + địa chỉ + MST) trái · khối ISO phải — form BM02 */}
        <div className="mb-3 flex items-start justify-between gap-4">
          {m.useLetterhead ? (
            /* eslint-disable-next-line @next/next/no-img-element -- ảnh tĩnh cho bản in, không cần tối ưu next/image */
            <img src="/tcm-letterhead.png" alt={m.companyFallbackName} className="h-[72px] w-auto" />
          ) : (
            <p className="text-[15px] font-bold">{m.companyFallbackName}</p>
          )}
          {m.iso && (
            <div className="shrink-0 text-right text-[10px] leading-tight text-neutral-700">
              <p>Số hiệu: {m.iso.formNo}</p>
              <p>Ngày BH: {m.iso.issuedDate}</p>
              <p>Lần BH/SĐ: {m.iso.revision}</p>
              <p>Số trang: {m.iso.pages}</p>
            </div>
          )}
        </div>

        <h1 className="text-center text-xl font-bold uppercase">{m.title}</h1>

        <div className="mt-3 mb-3 grid grid-cols-2 gap-x-8 gap-y-0.5">
          <div>
            {m.infoLeft.map(([label, value]) => (
              <p key={label}>
                <span className="font-semibold">{label}:</span> {value}
              </p>
            ))}
          </div>
          <div>
            {m.infoRight.map(([label, value]) => (
              <p key={label}>
                <span className="font-semibold">{label}:</span> {value}
              </p>
            ))}
          </div>
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

        {/* Chuỗi footer BM02 — dòng đậm nền xanh 0D81FF chữ trắng như form thật */}
        <div className="mt-3">
          {m.footer.map((f) => (
            <div
              key={f.label}
              className={`flex items-baseline justify-between gap-4 px-2 py-1 ${f.strong && m.mode === "client" ? "bg-[#0D81FF] font-bold text-white" : f.strong ? "border-t border-neutral-400 font-bold" : ""}`}
            >
              <span>{f.label}</span>
              {f.amount != null && <span className={moneyCls}>{formatNumber(f.amount, locale)}</span>}
            </div>
          ))}
        </div>

        {m.marginOverrideNote && <p className="mt-3 italic">Lý do duyệt margin dưới sàn: {m.marginOverrideNote}</p>}

        <div className="mt-4 space-y-0.5 text-[11px]">
          {m.terms.map((term) => (
            <p key={term}>{term}</p>
          ))}
        </div>

        {m.signature.length === 1 ? (
          <div className="mt-8 flex justify-end">
            <div className="text-center">
              <p className="font-bold">{m.signature[0].company}</p>
              <div className="h-20" />
              <p className="font-bold">{m.signature[0].name}</p>
              <p>{m.signature[0].title}</p>
            </div>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-4 text-center">
            {m.signature.map((s) => (
              <div key={s.title}>
                <p className="font-bold">{s.title}</p>
                <p className="text-[10px] italic text-neutral-600">(Ký, ghi rõ họ tên)</p>
                <div className="h-20" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
