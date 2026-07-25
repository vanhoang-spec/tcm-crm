"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav-items";

const SIDEBAR_WIDTH_KEY = "tcm_sidebar_width";
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 256; // = w-64

function NavLink({ item, onNavigate }: { item: (typeof NAV_ITEMS)[number]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = item.icon;
  const disabled = item.status === "soon";

  const content = (
    <span className="flex w-full items-center gap-3">
      <Icon className={cn("h-[18px] w-[18px] shrink-0", item.accent && !isActive && "text-accent-chat")} strokeWidth={2} />
      <span className={cn("flex-1 truncate", item.accent && !isActive && "font-semibold text-accent-chat")}>
        {tNav(item.labelKey)}
      </span>
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
          ? item.accent
            ? "bg-accent-chat text-white shadow-sm"
            : "bg-brand-500 text-white shadow-sm"
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

/** Sidebar desktop — chiều rộng kéo giãn được (200–420px), lưu localStorage, đọc lại lúc mount. */
export function Sidebar() {
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [ready, setReady] = useState(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    // Đọc localStorage sau mount (tránh SSR hydration mismatch) — chỉ chạy 1 lần lúc mount, không có
    // external system nào để "sync" lại sau đó, nên setState trực tiếp ở đây là đúng ý.
    const saved = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= SIDEBAR_MIN_WIDTH && saved <= SIDEBAR_MAX_WIDTH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWidth(saved);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const next = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, e.clientX));
      setWidth(next);
    }
    function onMouseUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      setWidth((w) => {
        window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
        return w;
      });
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function onHandleMouseDown() {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function onHandleDoubleClick() {
    setWidth(SIDEBAR_DEFAULT_WIDTH);
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT_WIDTH));
  }

  return (
    <aside
      className="sticky top-0 hidden h-screen shrink-0 border-r border-border bg-surface lg:block"
      style={{ width, transition: ready ? undefined : "none" }}
    >
      <div className="relative h-full">
        <SidebarContent />
        {/* Tay kéo giãn — bấm-kéo để đổi chiều rộng, double-click để về mặc định */}
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={onHandleMouseDown}
          onDoubleClick={onHandleDoubleClick}
          className="group absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize"
        >
          <div className="mx-auto h-full w-px bg-transparent group-hover:bg-brand-400" />
        </div>
      </div>
    </aside>
  );
}
