"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Labels = { advances: string; vendorPayments: string; debt: string; cashflow: string };

const TABS: { key: keyof Labels; seg: string }[] = [
  { key: "advances", seg: "" },
  { key: "vendorPayments", seg: "/vendor-payments" },
  { key: "debt", seg: "/debt" },
  { key: "cashflow", seg: "/cashflow" },
];

/** Thanh sub-module Finance — dàn ngang on-top (mirror workspace-nav). Cuộn ngang trên mobile. */
export function FinanceNav({ labels, showCashflow }: { labels: Labels; showCashflow: boolean }) {
  const pathname = usePathname();
  const base = "/finance";
  const tabs = showCashflow ? TABS : TABS.filter((t) => t.key !== "cashflow");

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 pb-2">
      {tabs.map((t) => {
        const href = base + t.seg;
        const active = t.seg === "" ? pathname === base : pathname.startsWith(href);
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
