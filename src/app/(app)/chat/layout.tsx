import { getCurrentStaffId } from "@/lib/current-staff";
import { listConversationsForStaff, isSuperAdmin } from "@/lib/chat";
import { prisma } from "@/lib/prisma";
import { ChatShell } from "./chat-shell";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const meId = await getCurrentStaffId();
  const [items, superAdmin, staffRows] = await Promise.all([
    meId ? listConversationsForStaff(meId) : Promise.resolve([]),
    isSuperAdmin(meId),
    prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, title: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const list = items.map((i) => ({
    id: i.id,
    type: i.type,
    title: i.title,
    avatarKey: i.avatarKey,
    lastBody: i.lastBody,
    lastAt: i.lastAt?.toISOString() ?? null,
    lastIsSystem: i.lastIsSystem,
    unread: i.unread,
    muted: i.muted,
    memberCount: i.memberCount,
    pinned: i.pinned,
  }));
  const staff = staffRows.filter((s) => s.id !== meId).map((s) => ({ id: s.id, fullName: s.fullName, title: s.title }));

  return (
    <ChatShell list={list} staff={staff} superAdmin={superAdmin}>
      {children}
    </ChatShell>
  );
}
