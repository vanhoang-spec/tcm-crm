"use client";

import { useTranslations } from "next-intl";
import { Printer } from "lucide-react";

/** Nút gọi hộp thoại in của trình duyệt — người dùng chọn "Save as PDF" để có file PDF. */
export function PrintButton() {
  const t = useTranslations("projects.coce");
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 print:hidden"
    >
      <Printer className="h-4 w-4" /> {t("printBtn")}
    </button>
  );
}
