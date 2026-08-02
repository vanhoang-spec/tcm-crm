"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Labels = {
  overview: string;
  pnl: string;
  timeline: string;
  orders: string;
  coce: string;
  planning: string;
  operations: string;
  production: string;
  purchasing: string;
  liquidation: string;
  iso: string;
};

// Thứ tự tab: Nghiệm thu chuyển ra cuối cùng; Production thêm cạnh Operations; Purchasing thêm sau Production.
const TABS: { key: keyof Labels; seg: string }[] = [
  { key: "overview", seg: "" },
  { key: "timeline", seg: "/timeline" },
  { key: "orders", seg: "/orders" },
  { key: "coce", seg: "/co-ce" },
  { key: "planning", seg: "/planning" },
  { key: "operations", seg: "/operations" },
  { key: "production", seg: "/production" },
  { key: "purchasing", seg: "/purchasing" },
  { key: "pnl", seg: "/pnl" },
  { key: "liquidation", seg: "/liquidation" },
  { key: "iso", seg: "/iso" },
];

/**
 * Thanh điều hướng sub-module trong workspace dự án — luôn nằm ngang trên đầu (không còn left-rail
 * trên desktop), để nhường toàn bộ chiều ngang cho nội dung (Master Timeline cần bảng rộng).
 * Cuộn ngang trên mobile nếu không đủ chỗ.
 */
export function WorkspaceNav({ projectId, labels, showPnl, showIso }: { projectId: string; labels: Labels; showPnl: boolean; showIso: boolean }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  // Ẩn tab P&L với người không có quyền — chỉ là TRANG TRÍ (HANDOVER 10.1), trang /pnl tự gác
  // requirePermission("projects.pnl.view") ở câu lệnh đầu.
  const tabs = TABS.filter((tab) => (tab.key !== "pnl" || showPnl) && (tab.key !== "iso" || showIso));

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
              (active
                ? "bg-brand-600 text-white"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground")
            }
          >
            {labels[t.key]}
          </Link>
        );
      })}
    </nav>
  );
}
