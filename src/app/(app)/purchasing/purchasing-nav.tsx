"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Labels = { rfq: string; vendors: string };

const TABS: { key: keyof Labels; seg: string }[] = [
  { key: "rfq", seg: "" },
  { key: "vendors", seg: "/vendors" },
];

/** Thanh tab sub-module Thu mua — mirror finance-nav. Cuộn ngang trên mobile. */
export function PurchasingNav({ labels }: { labels: Labels }) {
  const pathname = usePathname();
  const base = "/purchasing";
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 pb-2">
      {TABS.map((t) => {
        const href = base + t.seg;
        const active = t.seg === "" ? pathname === base || pathname.startsWith("/purchasing/rfq") : pathname.startsWith(href);
        return (
          <Link
            key={t.key}
            href={href}
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
