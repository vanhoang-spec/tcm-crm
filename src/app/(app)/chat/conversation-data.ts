import "server-only";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin, markConversationRead, groupReactions, buildPollView, TCM_FAMILY_GROUP_NAME } from "@/lib/chat";
import { getNumberSetting } from "@/lib/settings";
import type { ChatMessage, ChatReadState, ChatPinnedMessage, ChatReminder, ChatPoll, ChatStaff } from "./types";

/**
 * Dựng toàn bộ dữ liệu một hội thoại — dùng chung cho TRANG /chat/[id] và HỘP CHAT NỔI.
 *
 * Tách ra khỏi page.tsx vì hộp nổi cần đúng payload đó nhưng nạp theo yêu cầu (qua server action)
 * chứ không qua điều hướng. Nếu để mỗi bên tự truy vấn thì hai đường sẽ lệch nhau ngay lần sửa đầu.
 *
 * Đặt cạnh feature chứ không đưa vào lib/chat.ts: các type view (ChatMessage…) nằm ở ./types,
 * đưa hàm này vào lib sẽ tạo phụ thuộc ngược lib → app.
 *
 * Trả null khi không tìm thấy hội thoại HOẶC người gọi không có quyền xem — caller tự quyết
 * hiển thị gì (trang gọi notFound(), hộp nổi hiện thông báo).
 */
export type ConversationView = {
  id: string;
  /** Người đang xem — ChatConversation cần để phân biệt tin của chính mình, reaction, read-receipt. */
  meId: string | null;
  isGroup: boolean;
  title: string;
  /** Chức danh người còn lại (1-1) — group thì null, dùng memberCount để dựng phụ đề. */
  otherTitle: string | null;
  memberCount: number;
  avatarKey: string | null;
  /** Xem-chỉ-đọc với tư cách super-admin (không phải thành viên) — không gửi được tin. */
  superAdminView: boolean;
  canSend: boolean;
  isAdmin: boolean;
  muted: boolean;
  isTcmFamily: boolean;
  pollSeconds: number;
  initial: ChatMessage[];
  readState: ChatReadState[];
  allMemberIds: string[];
  pinned: ChatPinnedMessage[];
  /** Thành viên trừ chính mình — nguồn gợi ý @mention. */
  mentionMembers: ChatStaff[];
  /** Toàn bộ thành viên kèm vai trò — cho bảng quản lý nhóm. */
  managerMembers: (ChatStaff & { role: string })[];
  /** Nhân sự chưa ở trong nhóm — danh sách mời thêm. */
  candidates: ChatStaff[];
};

export async function buildConversationView(id: string, meId: string | null): Promise<ConversationView | null> {
  // Đọc trước để biết mốc "chỉ xem lịch sử từ..." (khi admin thêm thành viên mà không cho đọc lịch sử cũ).
  const myMembership = meId
    ? await prisma.conversationMember.findUnique({ where: { conversationId_staffId: { conversationId: id, staffId: meId } } })
    : null;

  const conv = await prisma.conversation.findUnique({
    where: { id },
    include: {
      members: { include: { staff: { select: { id: true, fullName: true, title: true } } }, orderBy: { joinedAt: "asc" } },
      messages: {
        where: {
          ...(meId ? { deletions: { none: { staffId: meId } } } : {}), // "Xoá ở phía tôi"
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
  if (!conv) return null;

  const membership = meId ? (conv.members.find((m) => m.staffId === meId) ?? null) : null;
  const superAdmin = !membership && (await isSuperAdmin(meId));
  if (!membership && !superAdmin) return null;

  if (membership && meId) await markConversationRead(id, meId);

  // Đọc lại read-state SAU markConversationRead — conv.members ở trên fetch trước đó nên còn
  // lastReadAt cũ của chính mình. Đây là nguồn cho read-receipt từng tin (so với createdAt).
  const memberReadRows = await prisma.conversationMember.findMany({
    where: { conversationId: id },
    select: { staffId: true, lastReadAt: true, staff: { select: { fullName: true } } },
  });
  const readState: ChatReadState[] = memberReadRows.map((r) => ({
    staffId: r.staffId,
    fullName: r.staff.fullName,
    lastReadAt: r.lastReadAt ? r.lastReadAt.toISOString() : null,
  }));

  const isGroup = conv.type === "GROUP";
  const other = conv.members.find((m) => m.staffId !== meId);

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
  const candidates: ChatStaff[] = isGroup
    ? (await prisma.staff.findMany({ where: { isActive: true }, select: { id: true, fullName: true, title: true }, orderBy: { fullName: "asc" } })).filter(
        (s) => !memberIdsSet.has(s.id),
      )
    : [];

  return {
    id,
    meId,
    isGroup,
    title: isGroup ? (conv.name ?? "—") : (other?.staff.fullName ?? "—"),
    otherTitle: isGroup ? null : (other?.staff.title ?? null),
    memberCount: conv.members.length,
    avatarKey: conv.avatarKey,
    superAdminView: superAdmin,
    canSend: !!membership,
    isAdmin: membership?.role === "ADMIN",
    muted: !!membership?.notificationsMuted,
    isTcmFamily: conv.name === TCM_FAMILY_GROUP_NAME,
    pollSeconds,
    initial,
    readState,
    allMemberIds: conv.members.map((m) => m.staffId),
    pinned,
    mentionMembers: conv.members.filter((m) => m.staffId !== meId).map((m) => ({ id: m.staffId, fullName: m.staff.fullName, title: m.staff.title })),
    managerMembers: conv.members.map((m) => ({ id: m.staffId, fullName: m.staff.fullName, title: m.staff.title, role: m.role })),
    candidates,
  };
}
