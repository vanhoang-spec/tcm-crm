"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, UserCog, Search, CircleUserRound } from "lucide-react";
import { setActAsStaff } from "@/app/(app)/act-as/actions";
import { StaffAvatar } from "@/components/ui/staff-avatar";
import { cn } from "@/lib/utils";

export type ActAsStaff = {
  id: string;
  fullName: string;
  title: string | null;
  departmentName: string | null;
  avatarKey: string | null;
  updatedAt: Date | string | null;
};

export function ActAsSwitcher({ staff, currentId }: { staff: ActAsStaff[]; currentId: string | null }) {
  const t = useTranslations("header.actAs");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const current = staff.find((s) => s.id === currentId) ?? null;
  const filtered = staff.filter((s) => s.fullName.toLowerCase().includes(q.trim().toLowerCase()));

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(id: string) {
    if (id === currentId || pending) return;
    setOpen(false);
    startTransition(async () => {
      await setActAsStaff(id);
      router.refresh();
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        title={t("label")}
        aria-label={t("label")}
        className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 hover:bg-surface-2 disabled:opacity-60"
      >
        {current ? (
          <StaffAvatar staffId={current.id} avatarKey={current.avatarKey} fullName={current.fullName} updatedAt={current.updatedAt} size="h-8 w-8" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">?</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 max-h-96 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <UserCog className="h-3.5 w-3.5" />
            {t("heading")}
          </div>
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-600 hover:bg-surface-2"
          >
            <CircleUserRound className="h-3.5 w-3.5" />
            {t("myProfile")}
          </Link>
          <div className="relative px-1 pb-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-8 w-full rounded-lg border border-border bg-surface-2 pl-8 pr-2 text-sm outline-none focus:border-brand-400"
            />
          </div>
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2",
                s.id === currentId && "bg-brand-50",
              )}
            >
              <StaffAvatar
                staffId={s.id}
                avatarKey={s.avatarKey}
                fullName={s.fullName}
                updatedAt={s.updatedAt}
                size="h-7 w-7"
                textSize="text-[10px]"
                className="flex-none"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{s.fullName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[s.title, s.departmentName].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
