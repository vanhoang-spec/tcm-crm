"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav-items";

function NavLink({ item, onNavigate }: { item: (typeof NAV_ITEMS)[number]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = item.icon;
  const disabled = item.status === "soon";

  const content = (
    <span className="flex w-full items-center gap-3">
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
      <span className="flex-1 truncate">{tNav(item.labelKey)}</span>
      {item.module && (
        <span
          className={cn(
            "shrink-0 text-[11px] tabular-nums",
            isActive ? "text-white/70" : "text-muted-foreground",
          )}
        >
          {item.module}
        </span>
      )}
      {disabled && (
        <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {tCommon("comingSoon")}
        </span>
      )}
    </span>
  );

  if (disabled) {
    return (
      <div
        className="flex cursor-not-allowed items-center rounded-lg px-3 py-2 text-sm text-muted-foreground/70"
        aria-disabled
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-brand-500 text-white shadow-sm"
          : "text-foreground hover:bg-surface-2",
      )}
    >
      {content}
    </Link>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-border px-4">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="border-t border-border px-3 py-3">
        <NavLink item={SETTINGS_ITEM} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-surface lg:block">
      <SidebarContent />
    </aside>
  );
}
