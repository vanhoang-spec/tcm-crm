"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Copy, Check, FileText, Printer } from "lucide-react";
import { DocBlocksView } from "@/components/ui/doc-blocks-view";
import { docToPlainText, type AiDoc } from "@/lib/doc-blocks";

export const aiInput =
  "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
export const aiTextarea =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function ToolCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function RunButton({ pending, hasResult }: { pending: boolean; hasResult: boolean }) {
  const t = useTranslations("ai");
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
    >
      <Sparkles className="h-4 w-4" />
      {pending ? t("running") : hasResult ? t("rerun") : t("run")}
    </button>
  );
}

/**
 * Hiển thị kết quả AI.
 *
 * HAI CHẾ ĐỘ, nhận biết bằng dữ liệu chứ không bằng cờ:
 *  - `doc` (tài liệu có cấu trúc, mọi công cụ ở /ai từ 20/08/2026): render theo khối + xuất Word/PDF.
 *  - `text` (text thuần): chỉ còn dùng cho nội dung ĐÃ LƯU từ trước — báo cáo insights MKT đọc từ DB.
 *    Giữ nhánh này để không phải chuyển đổi dữ liệu cũ; đừng thêm caller mới vào đây.
 *
 * ⚠ Vẫn KHÔNG render markdown/HTML từ nội dung model (không có `dangerouslySetInnerHTML`) — chế độ
 * mới an toàn vì render bằng JSX text node, React tự escape.
 */
export function AiResult({ doc, text, error }: { doc?: AiDoc; text?: string; error?: string }) {
  const t = useTranslations("ai");
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement | null>(null);
  const plain = doc ? docToPlainText(doc) : (text ?? "");

  /**
   * In ĐÚNG khối kết quả này ra PDF. Trang /ai có nhiều thẻ công cụ mở cùng lúc nên không thể in cả
   * trang; đánh dấu đúng phần tử rồi để CSS `body.ai-printing` ẩn mọi thứ còn lại (globals.css).
   * Gỡ dấu ở `afterprint` — người dùng bấm Huỷ trong hộp thoại in thì trang phải trở lại bình thường.
   */
  const printDoc = () => {
    const el = printRef.current;
    if (!el) return;
    const cleanup = () => {
      el.classList.remove("ai-print-target");
      document.body.classList.remove("ai-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    el.classList.add("ai-print-target");
    document.body.classList.add("ai-printing");
    window.print();
  };

  if (error) {
    return (
      <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (!doc && !text) {
    return <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{t("emptyResult")}</p>;
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{t("disclaimer")}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {doc && (
            <>
              {/* Xuất Word bằng FORM POST chứ không fetch+blob: trình duyệt tự tải file theo
                  Content-Disposition, không phải xử lý blob/URL.revokeObjectURL bằng tay. */}
              <form action="/api/ai-doc/docx" method="POST" target="_blank">
                <input type="hidden" name="doc" value={JSON.stringify(doc)} />
                <input type="hidden" name="note" value={t("aiNote")} />
                <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2">
                  <FileText className="h-3.5 w-3.5" />
                  {t("exportWord")}
                </button>
              </form>
              <button type="button" onClick={printDoc} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2">
                <Printer className="h-3.5 w-3.5" />
                {t("exportPdf")}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(plain).then(() => setCopied(true))}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t("copied") : t("copy")}
          </button>
        </div>
      </div>
      <div ref={printRef} className="mt-2 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-surface-2 p-4">
        {doc ? (
          <>
            <DocBlocksView doc={doc} />
            <p className="mt-4 border-t border-border pt-2 text-[11px] italic text-muted-foreground">{t("aiNote")}</p>
          </>
        ) : (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</div>
        )}
      </div>
    </div>
  );
}

export function NotConfiguredBanner() {
  const t = useTranslations("ai");
  return (
    <p className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2.5 text-sm text-warning">
      {t("notConfiguredBanner")}
    </p>
  );
}
