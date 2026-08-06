"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Labels = { schedule: string; timesheet: string; leave: string; recruit: string };

const TABS: { key: keyof Labels; seg: string }[] = [
  { key: "schedule", seg: "" },
  { key: "timesheet", seg: "/timesheet" },
  { key: "leave", seg: "/leave" },
  { key: "recruit", seg: "/recruit" },
];

/**
 * Thanh sub-module Nhân sự — mirror finance-nav. Cuộn ngang trên mobile.
 *
 * `showRecruit` chỉ để ĐỠ RỐI MẮT cho người không dính gì tới tuyển dụng. ⚠ Nó KHÔNG phải lớp
 * gác quyền: ẩn mục khỏi menu chỉ là trang trí, mọi trang và action bên trong vẫn tự kiểm lại
 * (HANDOVER 10.1 — không gate bằng layout).
 */
export function StaffNav({ labels, showRecruit }: { labels: Labels; showRecruit: boolean }) {
  const pathname = usePathname();
  const base = "/staff";

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 pb-2">
      {TABS.filter((t) => t.key !== "recruit" || showRecruit).map((t) => {
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
