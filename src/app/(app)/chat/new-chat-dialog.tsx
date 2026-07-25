"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X, User, Users } from "lucide-react";
import { initials, cn } from "@/lib/utils";
import type { ChatStaff } from "./types";
import { StaffCheckList } from "./staff-picker";
import { startDirectChat, createGroup } from "./actions";

export function NewChatDialog({ staff }: { staff: ChatStaff[] }) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [q, setQ] = useState("");

  const filtered = staff.filter((s) => s.fullName.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("newChatMenu")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("direct")}
                  className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", mode === "direct" ? "bg-brand-500 text-white" : "text-muted-foreground")}
                >
                  <User className="h-3.5 w-3.5" />
                  {t("newDirect")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("group")}
                  className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", mode === "group" ? "bg-brand-500 text-white" : "text-muted-foreground")}
                >
                  <Users className="h-3.5 w-3.5" />
                  {t("newGroup")}
                </button>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-surface-2">
                <X className="h-4 w-4" />
              </button>
            </div>

            {mode === "direct" ? (
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">{t("pickPerson")}</p>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="mb-2 h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm outline-none focus:border-brand-400"
                />
                <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                  {filtered.map((s) => (
                    <form key={s.id} action={startDirectChat}>
                      <input type="hidden" name="staffId" value={s.id} />
                      <button type="submit" className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left hover:bg-surface-2">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                          {initials(s.fullName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-foreground">{s.fullName}</span>
                          {s.title && <span className="block truncate text-xs text-muted-foreground">{s.title}</span>}
                        </span>
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ) : (
              <form action={createGroup}>
                <p className="mb-1 text-sm font-medium text-foreground">{t("createGroupTitle")}</p>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("groupName")}</label>
                <input
                  name="name"
                  required
                  placeholder={t("groupNamePlaceholder")}
                  className="mb-3 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand-400"
                />
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("pickMembers")}</label>
                <StaffCheckList staff={staff} name="memberIds" />
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2">
                    {t("cancel")}
                  </button>
                  <button type="submit" className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
                    {t("create")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
