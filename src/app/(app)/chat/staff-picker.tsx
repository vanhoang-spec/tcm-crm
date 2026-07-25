"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { initials, cn } from "@/lib/utils";
import type { ChatStaff } from "./types";

/**
 * Checkbox-list chọn nhiều nhân sự (dùng cho tạo nhóm + thêm thành viên).
 * Render <input type="checkbox" name={name}> để submit qua FormData.getAll(name).
 */
export function StaffCheckList({ staff, name }: { staff: ChatStaff[]; name: string }) {
  const t = useTranslations("chat");
  const [q, setQ] = useState("");
  const filtered = staff.filter((s) => s.fullName.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="rounded-lg border border-border">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="h-9 w-full rounded-t-lg border-b border-border bg-surface-2 px-3 text-sm outline-none focus:border-brand-400"
      />
      <div className="max-h-56 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t("noOneToAdd")}</p>
        ) : (
          filtered.map((s) => (
            <label key={s.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2")}>
              <input type="checkbox" name={name} value={s.id} className="h-4 w-4 accent-brand-500" />
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                {initials(s.fullName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-foreground">{s.fullName}</span>
                {s.title && <span className="block truncate text-xs text-muted-foreground">{s.title}</span>}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
