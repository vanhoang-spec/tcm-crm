"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { Logo } from "./logo";
import { SidebarContent } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { LanguageSwitcher } from "./language-switcher";

export function Header({ reminderCount = 0 }: { reminderCount?: number }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("common");

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur lg:px-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 text-foreground hover:bg-surface-2 lg:hidden"
        aria-label={t("openMenu")}
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="lg:hidden">
        <Logo compact />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
        <Link
          href="/reminders"
          className="relative rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          aria-label={t("notifications")}
        >
          <Bell className="h-5 w-5" />
          {reminderCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">
              {reminderCount > 99 ? "99+" : reminderCount}
            </span>
          )}
        </Link>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          CEO
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2"
              aria-label={t("closeMenu")}
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
}
