"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Labels = { overview: string; spends: string; budget: string };

const TABS: { key: keyof Labels; seg: string }[] = [
  { key: "overview", seg: "" },
  { key: "spends", seg: "/spends" },
  { key: "budget", seg: "/budget" },
];

/**
 * Thanh sub-module Chi phí văn phòng — mirror `finance-nav.tsx`.
 * Giữ nguyên `?year=` khi đổi tab: đang xem 2026 mà bấm sang tab khác lại nhảy về năm mặc định thì
 * người dùng phải chọn lại năm mỗi lần chuyển tab.
 */
export function OverheadNav({ labels }: { labels: Labels }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const year = params.get("year");
  const base = "/overhead";
  const qs = year ? `?year=${year}` : "";

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 pb-2">
      {TABS.map((t) => {
        const href = base + t.seg;
        const active = t.seg === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={t.key}
            href={href + qs}
            className={
              "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
              (active ? "bg-brand-600 text-white" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground")
            }
          >
            {labels[t.key]}
          </Link>
        );
      })}
    </nav>
  );
}
