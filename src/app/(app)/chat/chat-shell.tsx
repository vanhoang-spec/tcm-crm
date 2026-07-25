"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ChatListItem, ChatStaff } from "./types";
import { ConversationList } from "./conversation-list";

export function ChatShell({
  list,
  staff,
  superAdmin,
  children,
}: {
  list: ChatListItem[];
  staff: ChatStaff[];
  superAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const inConversation = pathname !== "/chat";

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-border bg-surface">
      {/* Cột trái: danh sách hội thoại — ẩn trên mobile khi đang mở 1 hội thoại */}
      <aside
        className={cn(
          "w-full flex-none flex-col border-r border-border lg:flex lg:w-80",
          inConversation ? "hidden lg:flex" : "flex",
        )}
      >
        <ConversationList list={list} staff={staff} superAdmin={superAdmin} />
      </aside>

      {/* Cột phải: hội thoại — ẩn trên mobile khi đang ở danh sách */}
      <section className={cn("min-w-0 flex-1 flex-col", inConversation ? "flex" : "hidden lg:flex")}>
        {children}
      </section>
    </div>
  );
}
