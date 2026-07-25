"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, Bell, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Logo } from "./logo";
import { SidebarContent } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { LanguageSwitcher } from "./language-switcher";
import { ActAsSwitcher, type ActAsStaff } from "./act-as-switcher";
import { NotificationPoller } from "./notification-poller";
import { logoutAction } from "@/app/(auth)/actions";

export function Header({
  reminderCount = 0,
  actAsStaff = [],
  currentStaffId = null,
  canImpersonate = false,
  impersonating = false,
  permissions = [],
}: {
  reminderCount?: number;
  actAsStaff?: ActAsStaff[];
  currentStaffId?: string | null;
  /** Chỉ ADMIN mới được đổi sang xem với tư cách người khác. */
  canImpersonate?: boolean;
  impersonating?: boolean;
  /** Quyền của người ĐANG THAO TÁC (đã tính act-as) — quyết định menu mobile hiện mục nào. */
  permissions?: string[];
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("common");
  const tAuth = useTranslations("auth");

  return (
    <>
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
          {canImpersonate && <ActAsSwitcher staff={actAsStaff} currentId={currentStaffId} />}
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              aria-label={tAuth("logout")}
              title={tAuth("logout")}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </form>
        </div>

        {impersonating && (
          <div className="absolute inset-x-0 top-16 border-b border-warning/40 bg-warning-bg px-4 py-1.5 text-center text-xs text-warning">
            {tAuth("stopImpersonating")}
          </div>
        )}
      </header>

      <NotificationPoller />

      {/* Drawer mobile ĐẶT NGOÀI <header> — header có backdrop-blur nên trở thành containing
          block cho mọi descendant position:fixed (spec CSS Filter Effects), khiến fixed inset-0
          bị tính theo khung header (cao 64px) thay vì viewport. Đặt ở đây để fixed bám viewport. */}
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
            <SidebarContent onNavigate={() => setOpen(false)} permissions={permissions} />
          </div>
        </div>
      )}
    </>
  );
}
