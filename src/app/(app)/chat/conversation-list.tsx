"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Search, BellOff, Users, User, Pin } from "lucide-react";
import { cn, initials, groupAvatarUrl } from "@/lib/utils";
import type { ChatListItem, ChatStaff } from "./types";
import { NewChatDialog } from "./new-chat-dialog";
import { toggleConversationPin } from "./actions";

function shortTime(iso: string | null, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }).format(d);
}

export function ConversationList({ list, staff, superAdmin }: { list: ChatListItem[]; staff: ChatStaff[]; superAdmin: boolean }) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");

  const filtered = list.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase()));

  async function handleTogglePin(e: React.MouseEvent, conversationId: string) {
    e.preventDefault();
    e.stopPropagation();
    await toggleConversationPin(conversationId);
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <h1 className="text-sm font-semibold text-foreground">{t("title")}</h1>
        <NewChatDialog staff={staff} />
      </div>

      <div className="p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-lg border border-border bg-surface-2 pl-8 pr-3 text-sm outline-none focus:border-brand-400"
          />
        </div>
      </div>

      {superAdmin && (
        <Link
          href="/chat/all"
          className={cn(
            "mx-2 mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50",
            pathname === "/chat/all" && "bg-brand-50",
          )}
        >
          <Users className="h-3.5 w-3.5" />
          {t("superAdminView")}
        </Link>
      )}

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("emptyList")}</p>
        ) : (
          <ul>
            {filtered.map((c) => {
              const active = pathname === `/chat/${c.id}`;
              return (
                <li key={c.id} className={cn("group relative flex items-center border-b border-border/60 hover:bg-surface-2", active && "bg-brand-50 hover:bg-brand-50")}>
                  <Link href={`/chat/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
                    {c.type === "GROUP" && c.avatarKey ? (
                      // eslint-disable-next-line @next/next/no-img-element -- path tĩnh public HOẶC ảnh upload qua route có auth (xem groupAvatarUrl)
                      <img src={groupAvatarUrl(c.id, c.avatarKey) ?? undefined} alt="" className="h-10 w-10 flex-none rounded-full object-cover" />
                    ) : (
                      <span className="relative flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                        {c.type === "GROUP" ? <Users className="h-5 w-5" /> : initials(c.title)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {c.pinned && <Pin className="h-3 w-3 flex-none text-brand-600" />}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{c.title}</span>
                        {c.muted && <BellOff className="h-3 w-3 flex-none text-muted-foreground" />}
                        <span className="flex-none text-[11px] text-muted-foreground">{shortTime(c.lastAt, locale)}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {c.lastIsSystem ? "•" : c.lastBody ?? "—"}
                        </span>
                        {c.unread > 0 && (
                          <span className="flex h-4 min-w-4 flex-none items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold leading-none text-white">
                            {c.unread > 99 ? "99+" : c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex-none">
                      {c.type === "GROUP" ? (
                        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">{t("groupBadge")}</span>
                      ) : (
                        <User className="h-3 w-3 text-muted-foreground" />
                      )}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => handleTogglePin(e, c.id)}
                    title={c.pinned ? t("unpinConversation") : t("pinConversation")}
                    className={cn(
                      "mr-2 flex-none rounded-lg p-1.5 hover:bg-surface",
                      c.pinned ? "text-brand-600" : "text-muted-foreground opacity-0 group-hover:opacity-100",
                    )}
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
