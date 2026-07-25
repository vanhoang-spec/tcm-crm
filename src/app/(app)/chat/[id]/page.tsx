import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { isSuperAdmin, markConversationRead, groupReactions, buildPollView, TCM_FAMILY_GROUP_NAME } from "@/lib/chat";
import { getNumberSetting } from "@/lib/settings";
import { initials, groupAvatarUrl } from "@/lib/utils";
import type { ChatMessage, ChatReadState, ChatPinnedMessage, ChatReminder, ChatPoll } from "../types";
import { ChatConversation } from "../chat-conversation";
import { GroupManager } from "../group-manager";
import { DissolveDirectButton } from "../dissolve-direct-button";
import { toggleMute } from "../actions";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();

  // Đọc trước để biết mốc "chỉ xem lịch sử từ..." (nếu admin add member này với chọn "không đọc lịch sử cũ").
  const myMembership = meId ? await prisma.conversationMember.findUnique({ where: { conversationId_staffId: { conversationId: id, staffId: meId } } }) : null;

  const conv = await prisma.conversation.findUnique({
    where: { id },
    include: {
      members: { include: { staff: { select: { id: true, fullName: true, title: true } } }, orderBy: { joinedAt: "asc" } },
      messages: {
        where: {
          ...(meId ? { deletions: { none: { staffId: meId } } } : {}), // "Delete for me"
          ...(myMembership?.historyVisibleFrom ? { createdAt: { gte: myMembership.historyVisibleFrom } } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: 300,
        include: {
          sender: { select: { id: true, fullName: true } },
          mentions: { include: { staff: { select: { id: true, fullName: true } } } },
          reactions: { select: { messageId: true, emoji: true, staffId: true, staff: { select: { fullName: true } } } },
          replyTo: {
            select: {
              id: true,
              type: true,
              body: true,
              linkText: true,
              attachmentName: true,
              attachmentDurationSec: true,
              sender: { select: { fullName: true } },
            },
          },
        },
      },
    },
  });
  if (!conv) notFound();

  const membership = meId ? conv.members.find((m) => m.staffId === meId) ?? null : null;
  const superAdmin = !membership && (await isSuperAdmin(meId));
  if (!membership && !superAdmin) notFound();

  if (membership && meId) await markConversationRead(id, meId);

  // Đọc lại read-state SAU markConversationRead (conv.members ở trên đã fetch trước đó nên có thể
  // còn lastReadAt cũ của chính mình) — nguồn cho read-receipt theo từng tin nhắn (so createdAt).
  const memberReadRows = await prisma.conversationMember.findMany({
    where: { conversationId: id },
    select: { staffId: true, lastReadAt: true, staff: { select: { fullName: true } } },
  });
  const readState: ChatReadState[] = memberReadRows.map((r) => ({
    staffId: r.staffId,
    fullName: r.staff.fullName,
    lastReadAt: r.lastReadAt ? r.lastReadAt.toISOString() : null,
  }));
  const allMemberIds = conv.members.map((m) => m.staffId);

  const isGroup = conv.type === "GROUP";
  const other = conv.members.find((m) => m.staffId !== meId);
  const title = isGroup ? conv.name ?? "—" : other?.staff.fullName ?? "—";
  const subtitle = isGroup ? t("membersCount", { count: conv.members.length }) : other?.staff.title ?? "";

  const pollSeconds = await getNumberSetting("communication", "message_poll_seconds", 4);

  const pinnedRows = await prisma.pinnedMessage.findMany({
    where: { conversationId: id },
    orderBy: { pinnedAt: "asc" },
    include: {
      message: {
        select: { id: true, type: true, body: true, linkText: true, attachmentName: true, attachmentDurationSec: true, sender: { select: { fullName: true } } },
      },
      pinnedBy: { select: { fullName: true } },
    },
  });
  const pinnedMessageIds = new Set(pinnedRows.map((p) => p.messageId));
  const pinned: ChatPinnedMessage[] = pinnedRows.map((p) => ({
    id: p.id,
    messageId: p.messageId,
    type: p.message.type,
    senderName: p.message.sender?.fullName ?? null,
    body: p.message.body,
    linkText: p.message.linkText,
    attachmentName: p.message.attachmentName,
    attachmentDurationSec: p.message.attachmentDurationSec,
    pinnedByName: p.pinnedBy?.fullName ?? null,
  }));

  const pollRows = await prisma.poll.findMany({
    where: { message: { conversationId: id } },
    include: { options: { orderBy: { sort: "asc" }, include: { votes: { include: { staff: { select: { fullName: true } } } } } } },
  });
  const pollsByMessageId: Record<string, ChatPoll> = {};
  for (const p of pollRows) pollsByMessageId[p.messageId] = buildPollView(p, p.options, meId);

  const reminderRows = await prisma.reminder.findMany({ where: { conversationId: id } });
  const remindersByMessageId: Record<string, ChatReminder> = {};
  for (const r of reminderRows) {
    remindersByMessageId[r.messageId] = {
      id: r.id,
      title: r.title,
      remindAt: r.remindAt.toISOString(),
      recurrence: r.recurrence,
      audience: r.audience,
      isActive: r.isActive,
    };
  }

  const initial: ChatMessage[] = conv.messages.map((m) => ({
    id: m.id,
    type: m.type,
    senderId: m.senderId,
    senderName: m.sender?.fullName ?? null,
    body: m.body,
    systemEvent: m.systemEvent,
    linkUrl: m.linkUrl,
    linkText: m.linkText,
    linkPreviewTitle: m.linkPreviewTitle,
    linkPreviewDescription: m.linkPreviewDescription,
    linkPreviewImageUrl: m.linkPreviewImageUrl,
    linkPreviewSiteName: m.linkPreviewSiteName,
    attachmentName: m.attachmentName,
    attachmentMime: m.attachmentMime,
    attachmentSize: m.attachmentSize,
    attachmentDurationSec: m.attachmentDurationSec,
    isForwarded: m.isForwarded,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          type: m.replyTo.type,
          senderName: m.replyTo.sender?.fullName ?? null,
          body: m.replyTo.body,
          linkText: m.replyTo.linkText,
          attachmentName: m.replyTo.attachmentName,
          attachmentDurationSec: m.replyTo.attachmentDurationSec,
        }
      : null,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    deletedForEveryone: !!m.deletedForEveryoneAt,
    pinned: pinnedMessageIds.has(m.id),
    mentions: m.mentions.map((x) => ({ staffId: x.staffId, name: x.staff?.fullName ?? null, isAll: x.isAll })),
    reactions: groupReactions(m.reactions, meId),
    reminder: remindersByMessageId[m.id] ?? null,
    poll: pollsByMessageId[m.id] ?? null,
  }));

  const memberIdsSet = new Set(conv.members.map((m) => m.staffId));
  const mentionMembers = conv.members.filter((m) => m.staffId !== meId).map((m) => ({ id: m.staffId, fullName: m.staff.fullName, title: m.staff.title }));
  const managerMembers = conv.members.map((m) => ({ id: m.staffId, fullName: m.staff.fullName, title: m.staff.title, role: m.role }));
  const candidates = isGroup
    ? (await prisma.staff.findMany({ where: { isActive: true }, select: { id: true, fullName: true, title: true }, orderBy: { fullName: "asc" } })).filter((s) => !memberIdsSet.has(s.id))
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header hội thoại */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Link href="/chat" className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 lg:hidden" aria-label={t("close")}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {isGroup && conv.avatarKey ? (
          // eslint-disable-next-line @next/next/no-img-element -- path tĩnh public HOẶC ảnh upload qua route có auth (xem groupAvatarUrl)
          <img src={groupAvatarUrl(id, conv.avatarKey) ?? undefined} alt="" className="h-9 w-9 flex-none rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {isGroup ? <Users className="h-5 w-5" /> : initials(title)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {superAdmin ? t("superAdminViewHint") : subtitle}
          </p>
        </div>

        {membership && (
          <form action={toggleMute.bind(null, id)}>
            <button type="submit" title={membership.notificationsMuted ? t("unmute") : t("mute")} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
              {membership.notificationsMuted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
            </button>
          </form>
        )}
        {isGroup && membership && (
          <GroupManager
            conversationId={id}
            meId={meId}
            name={conv.name ?? ""}
            members={managerMembers}
            candidates={candidates}
            myRole={membership.role}
            isTcmFamily={conv.name === TCM_FAMILY_GROUP_NAME}
            avatarUrl={groupAvatarUrl(id, conv.avatarKey)}
          />
        )}
        {!isGroup && membership && <DissolveDirectButton conversationId={id} />}
      </div>

      <ChatConversation
        conversationId={id}
        initial={initial}
        meId={meId}
        members={mentionMembers}
        canSend={!!membership}
        pollSeconds={pollSeconds}
        initialReadState={readState}
        allMemberIds={allMemberIds}
        isAdmin={membership?.role === "ADMIN"}
        initialPinned={pinned}
      />
    </div>
  );
}
