"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Printer } from "lucide-react";

/**
 * Nút "Tải PNG"/"In PDF" hiển thị cho mọi người xem trang — không gate quyền thật, nhất quán quy ước
 * "chưa có auth/RBAC thật" xuyên suốt app (xem current-staff.ts). "Áp dụng cho HR Manager" hiểu theo
 * nghĩa sử dụng (HR Manager là người cần dùng nhất), không phải kiểm soát truy cập kỹ thuật.
 */
export function OrgChartClient({ svg, staffCount }: { svg: string; staffCount: number }) {
  const t = useTranslations("orgchart");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadPng() {
    const svgEl = wrapperRef.current?.querySelector("svg");
    if (!svgEl) return;
    setDownloading(true);
    try {
      const svgText = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image load failed"));
        img.src = url;
      });
      const scale = 2; // xuất nét gấp đôi kích thước hiển thị
      const vb = svgEl.getAttribute("viewBox")?.split(" ").map(Number) ?? [0, 0, img.width, img.height];
      const w = vb[2] || img.width;
      const h = vb[3] || img.height;
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "tcm-so-do-to-chuc.png";
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted-foreground">{t("staffCount", { count: staffCount })}</p>
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={downloading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? "..." : t("downloadPng")}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2"
          >
            <Printer className="h-3.5 w-3.5" />
            {t("printPdf")}
          </button>
        </div>
      </div>

      <div
        id="org-chart-print-area"
        ref={wrapperRef}
        className="overflow-auto rounded-xl border border-border bg-surface p-4"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
