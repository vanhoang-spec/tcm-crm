"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Labels = { posts: string; insights: string };

/**
 * Thanh sub-module MKT post — mirror `overhead-nav.tsx`, bỏ phần giữ query param (module này không
 * lọc theo năm).
 *
 * Tab "Bài đăng" sáng cho cả `/mkt/new` và `/mkt/[id]` — đó vẫn là cùng một luồng việc; nếu so
 * `pathname === "/mkt"` thì mở một bài ra là cả hai tab đều tối, người dùng mất dấu mình đang ở đâu.
 */
export function MktNav({ labels }: { labels: Labels }) {
  const pathname = usePathname();
  const onInsights = pathname.startsWith("/mkt/insights");

  const tabs = [
    { key: "posts", href: "/mkt", label: labels.posts, active: !onInsights },
    { key: "insights", href: "/mkt/insights", label: labels.insights, active: onInsights },
  ];

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 pb-2">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={
            "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
            (t.active ? "bg-brand-600 text-white" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground")
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
