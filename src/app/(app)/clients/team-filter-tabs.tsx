import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Team } from "@prisma/client";

export function TeamFilterTabs({
  teams,
  activeCode,
  allLabel,
}: {
  teams: Team[];
  activeCode?: string;
  allLabel: string;
}) {
  const tabs = [{ code: undefined, label: allLabel }, ...teams.map((t) => ({ code: t.code, label: t.code }))];

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
      {tabs.map((tab) => {
        const isActive = activeCode === tab.code || (!activeCode && !tab.code);
        const href = tab.code ? `/clients?team=${tab.code}` : "/clients";
        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              isActive ? "bg-surface text-brand-700 shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
