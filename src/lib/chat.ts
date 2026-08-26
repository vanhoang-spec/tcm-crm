import { prisma } from "./prisma";
import { getStringSetting } from "./settings";
import { saveChatAttachment } from "./chat-storage";
import { buildWelcomeSvg } from "./welcome-card";

/**
 * Helper thuần cho module ⑨ Communication (chat nội bộ).
 * Danh tính "tôi là ai" đến từ getCurrentStaffId (act-as). Guard membership/admin enforce ở đây,
 * KHÔNG tin client. Super-admin (chức danh cấu hình được) chỉ XEM all group, KHÔNG gửi được.
 */

export const SUPER_ADMIN_TITLES_DEFAULT = "CEO";

/** Chức danh trong danh sách super-admin → xem được mọi group chat (read-only). */
export async function isSuperAdmin(staffId: string | null): Promise<boolean> {
  if (!staffId) return false;
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { title: true } });
  if (!staff?.title) return false;
  const titles = (await getStringSetting("communication", "super_admin_titles", SUPER_ADMIN_TITLES_DEFAULT))
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return titles.includes(staff.title.trim().toLowerCase());
}

/** Tìm hoặc tạo hội thoại 1-1 giữa 2 người (idempotent). DIRECT luôn đúng 2 member. */
export async function getOrCreateDirectConversation(meId: string, otherId: string) {
  if (meId === otherId) throw new Error("Không thể tự chat với chính mình.");
  const existing = await prisma.conversation.findFirst({
    where: {
      type: "DIRECT",
      AND: [{ members: { some: { staffId: meId } } }, { members: { some: { staffId: otherId } } }],
    },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: {
      type: "DIRECT",
      createdById: meId,
      members: { create: [{ staffId: meId, role: "MEMBER" }, { staffId: otherId, role: "MEMBER" }] },
    },
  });
}

/** Membership của staff trong hội thoại (hoặc null). */
export function getMembership(conversationId: string, staffId: string) {
  return prisma.conversationMember.findUnique({
    where: { conversationId_staffId: { conversationId, staffId } },
  });
}

/** Bắt buộc là thành viên — throw nếu không. Trả membership. */
export async function assertMember(conversationId: string, staffId: string) {
  const m = await getMembership(conversationId, staffId);
  if (!m) throw new Error("NOT_MEMBER");
  return m;
}

/** Bắt buộc là admin của nhóm — throw nếu không. */
export async function assertAdmin(conversationId: string, staffId: string) {
  const m = await getMembership(conversationId, staffId);
  if (!m || m.role !== "ADMIN") throw new Error("NOT_ADMIN");
  return m;
}

export type ConversationListItem = {
  id: string;
  type: string;
  title: string; // group name hoặc tên người còn lại (DIRECT)
  avatarKey: string | null;
  lastBody: string | null;
  lastAt: Date | null;
  lastIsSystem: boolean;
  unread: number;
  muted: boolean;
  role: string;
  memberCount: number;
  pinned: boolean; // ghim lên đầu danh sách CỦA RIÊNG người này (ConversationMember.sidebarPinnedAt)
};

/** Danh sách hội thoại của 1 staff + last message + unread + trạng thái membership. */
export async function listConversationsForStaff(staffId: string): Promise<ConversationListItem[]> {
  const memberships = await prisma.conversationMember.findMany({
    where: { staffId },
    include: {
      conversation: {
        include: {
          members: { include: { staff: { select: { id: true, fullName: true } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  const items = await Promise.all(
    memberships.map(async (m) => {
      const conv = m.conversation;
      const last = conv.messages[0] ?? null;
      const other = conv.members.find((mem) => mem.staffId !== staffId);
      const title = conv.type === "GROUP" ? conv.name ?? "—" : other?.staff.fullName ?? "—";
      const unread = await prisma.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: staffId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      return {
        id: conv.id,
        type: conv.type,
        title,
        avatarKey: conv.avatarKey,
        lastBody: last?.body ?? (last?.systemEvent ? "•" : last?.linkText ?? null),
        lastAt: last?.createdAt ?? null,
        lastIsSystem: last?.type === "SYSTEM",
        unread,
        muted: m.notificationsMuted,
        role: m.role,
        memberCount: conv.members.length,
        pinned: !!m.sidebarPinnedAt,
      } satisfies ConversationListItem;
    }),
  );

  // Ghim lên đầu trước, còn lại theo tin nhắn mới nhất — như hầu hết app chat phổ biến.
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0);
  });
  return items;
}

export type ForwardTarget = { id: string; type: string; title: string };

/** Danh sách hội thoại của staff, gọn nhẹ cho picker "Chuyển tiếp" (không cần last message/unread). */
export async function listConversationsForForward(staffId: string): Promise<ForwardTarget[]> {
  const memberships = await prisma.conversationMember.findMany({
    where: { staffId },
    include: {
      conversation: {
        include: { members: { include: { staff: { select: { id: true, fullName: true } } } } },
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
  });
  return memberships.map((m) => {
    const conv = m.conversation;
    const other = conv.members.find((mem) => mem.staffId !== staffId);
    const title = conv.type === "GROUP" ? conv.name ?? "—" : other?.staff.fullName ?? "—";
    return { id: conv.id, type: conv.type, title };
  });
}

/** Đánh dấu đã đọc hội thoại (chỉ khi là thành viên). */
export async function markConversationRead(conversationId: string, staffId: string) {
  await prisma.conversationMember.updateMany({
    where: { conversationId, staffId },
    data: { lastReadAt: new Date() },
  });
}

/** Validate danh sách mention ⊆ thành viên hội thoại; trả về set id hợp lệ. */
export async function validateMentionIds(conversationId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const members = await prisma.conversationMember.findMany({
    where: { conversationId, staffId: { in: ids } },
    select: { staffId: true },
  });
  return members.map((m) => m.staffId);
}

/**
 * Fan-out notification khi có tin nhắn mới.
 * - Người bị @mention (hoặc @all) → CHAT_MENTION (BỎ QUA mute — tin quan trọng).
 * - Còn lại (chưa mute) → CHAT_MESSAGE.
 * - Người gửi không nhận.
 */
export async function notifyNewMessage(opts: {
  conversationId: string;
  senderId: string;
  senderName: string;
  convType: string;
  convName: string | null;
  preview: string;
  mentionStaffIds: string[];
  mentionAll: boolean;
}) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId: opts.conversationId },
    select: { staffId: true, notificationsMuted: true },
  });
  const mentioned = new Set(opts.mentionAll ? members.map((m) => m.staffId) : opts.mentionStaffIds);
  const title = opts.convType === "GROUP" ? opts.convName ?? "Nhóm" : opts.senderName;

  const rows = members
    .filter((m) => m.staffId !== opts.senderId)
    .map((m) => {
      const isMention = mentioned.has(m.staffId);
      if (!isMention && m.notificationsMuted) return null; // mute chỉ chặn tin thường, không chặn mention
      const body = opts.convType === "GROUP" ? `${opts.senderName}: ${opts.preview}` : opts.preview;
      return {
        recipientStaffId: m.staffId,
        type: isMention ? "CHAT_MENTION" : "CHAT_MESSAGE",
        title: isMention ? `${title} — @${opts.senderName}` : title,
        body,
        conversationId: opts.conversationId,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return;
  await prisma.notification.createMany({ data: rows });

  /**
   * Đẩy NGAY, không đợi job 5 phút — tin nhắn báo trễ 5 phút thì vô nghĩa.
   *
   * ⚠ Đánh dấu `pushedAt` cho đúng những thông báo vừa tạo để job quét không bắn lại lần hai. Lọc
   * theo (người nhận + hội thoại + chưa đẩy) vì `createMany` của SQLite không trả về id.
   * ⚠ Bọc try/catch: push hỏng KHÔNG được làm hỏng việc gửi tin nhắn.
   */
  try {
    /**
     * ⚠ NẠP ĐỘNG, ĐỪNG ĐỔI THÀNH IMPORT TĨNH: lib/push.ts khai "server-only", mà file chat.ts này
     * được prisma/seed.ts import (lấy hằng TCM_FAMILY_GROUP_NAME). Import tĩnh làm "npm run db:seed"
     * NỔ NGAY khi nạp module — và seed là bước BẮT BUỘC sau migrate deploy (HANDOVER 10.1), tức
     * deploy sẽ hỏng ở đúng bước cấp quyền. tsc/eslint/next build đều KHÔNG bắt được lỗi này.
     */
    const { sendPushToStaff, markNotificationsPushed } = await import("./push");
    const ids = rows.map((r) => r.recipientStaffId);
    await sendPushToStaff(ids, {
      title,
      body: rows[0].body,
      url: `/chat/${opts.conversationId}`,
      tag: `chat-${opts.conversationId}`,
    });
    // Đánh dấu KỂ CẢ khi không gửi được thiết bị nào (người nhận chưa bật push): không thì job quét
    // sẽ lôi lại đúng đống thông báo đó mỗi 5 phút, mãi mãi.
    const fresh = await prisma.notification.findMany({
      where: { conversationId: opts.conversationId, recipientStaffId: { in: ids }, pushedAt: null },
      select: { id: true },
    });
    await markNotificationsPushed(fresh.map((n) => n.id));
  } catch (e) {
    console.error("[push] lỗi đẩy thông báo chat:", e);
  }
}

/** Ghi 1 system message (join/leave/rename/promote). body = biến phụ (tên người / tên nhóm mới). */
export async function addSystemMessage(
  conversationId: string,
  actorId: string | null,
  systemEvent: string,
  body: string | null,
) {
  return prisma.message.create({
    data: { conversationId, senderId: actorId, type: "SYSTEM", systemEvent, body },
  });
}

/** Danh sách id tin nhắn đang được ghim trong 1 hội thoại (dùng để đánh dấu `pinned` khi map message). */
export async function getPinnedMessageIds(conversationId: string): Promise<Set<string>> {
  const rows = await prisma.pinnedMessage.findMany({ where: { conversationId }, select: { messageId: true } });
  return new Set(rows.map((r) => r.messageId));
}

/** Gộp raw MessageReaction rows (đã join staff.fullName) theo emoji → dùng cho ChatMessageReactionGroup[]. */
export function groupReactions(
  reactions: { emoji: string; staffId: string; staff: { fullName: string } }[],
  meId: string | null,
): { emoji: string; count: number; reactedByMe: boolean; staffNames: string[] }[] {
  const map = new Map<string, { count: number; reactedByMe: boolean; staffNames: string[] }>();
  for (const r of reactions) {
    const entry = map.get(r.emoji) ?? { count: 0, reactedByMe: false, staffNames: [] };
    entry.count += 1;
    entry.staffNames.push(r.staff.fullName);
    if (r.staffId === meId) entry.reactedByMe = true;
    map.set(r.emoji, entry);
  }
  return Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }));
}

export type PollOptionView = { id: string; text: string; voteCount: number; votedByMe: boolean; voterNames: string[] };
export type PollView = {
  id: string;
  question: string;
  allowMultiple: boolean;
  anonymous: boolean;
  hideResultsUntilVoted: boolean;
  allowAddOptions: boolean;
  closesAt: string | null;
  closed: boolean;
  totalVoters: number;
  myVoted: boolean;
  canSeeResults: boolean;
  options: PollOptionView[];
};

/**
 * Gộp Poll + PollOption + PollVote (đã join staff.fullName) thành view cho client.
 * canSeeResults: đóng poll HOẶC không bật hideResultsUntilVoted HOẶC chính người xem đã vote.
 * anonymous → voterNames luôn rỗng (không lộ danh tính dù canSeeResults=true).
 */
export function buildPollView(
  poll: { id: string; question: string; allowMultiple: boolean; anonymous: boolean; hideResultsUntilVoted: boolean; allowAddOptions: boolean; closesAt: Date | null },
  options: { id: string; text: string; votes: { staffId: string; staff: { fullName: string } }[] }[],
  meId: string | null,
): PollView {
  const closed = poll.closesAt ? poll.closesAt.getTime() <= Date.now() : false;
  const voterIds = new Set<string>();
  for (const o of options) for (const v of o.votes) voterIds.add(v.staffId);
  const myVoted = meId ? options.some((o) => o.votes.some((v) => v.staffId === meId)) : false;
  const canSeeResults = closed || !poll.hideResultsUntilVoted || myVoted;
  return {
    id: poll.id,
    question: poll.question,
    allowMultiple: poll.allowMultiple,
    anonymous: poll.anonymous,
    hideResultsUntilVoted: poll.hideResultsUntilVoted,
    allowAddOptions: poll.allowAddOptions,
    closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
    closed,
    totalVoters: voterIds.size,
    myVoted,
    canSeeResults,
    options: options.map((o) => ({
      id: o.id,
      text: o.text,
      voteCount: o.votes.length,
      votedByMe: meId ? o.votes.some((v) => v.staffId === meId) : false,
      voterNames: poll.anonymous ? [] : o.votes.map((v) => v.staff.fullName),
    })),
  };
}

/** Cắt gọn preview cho notification/list. */
export function previewText(s: string, max = 120): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export const TCM_FAMILY_GROUP_NAME = "GIA ĐÌNH TCM";
const AUTO_JOIN_EMAIL_DOMAIN = "@tcmbtl.com";

/**
 * Auto-join "lần đăng nhập đầu tiên": nhân sự mới có email @tcmbtl.com (điều kiện lọc theo yêu cầu —
 * nhân sự cũ dùng domain khác nên KHÔNG bị ảnh hưởng) được tự thêm vào nhóm "GIA ĐÌNH TCM" (đã seed
 * sẵn) nếu chưa là thành viên, kèm 1 ảnh chào mừng (pháo hoa, tự vẽ SVG) do hệ thống tự đăng.
 * Gọi từ setActAsStaff (điểm "trở thành nhân sự X" duy nhất trong app do chưa có auth thật — xem
 * src/app/(app)/act-as/actions.ts). Idempotent: đã là thành viên rồi thì bỏ qua, an toàn gọi lại.
 */
export async function ensureTcmFamilyMembership(staffId: string): Promise<void> {
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, fullName: true, email: true, isExternal: true } });
  if (!staff || !staff.email.toLowerCase().endsWith(AUTO_JOIN_EMAIL_DOMAIN)) return;
  // ⚠ NGƯỜI NGOÀI công ty (đối tác, agency phối hợp) có email @tcmbtl.com nhưng KHÔNG vào nhóm
  // chat chung — quyết định chủ dự án 26/08/2026. Chặn ở ĐÂY chứ không phải ở chỗ gọi: hàm này là
  // đường tự-thêm DUY NHẤT, và nó idempotent nên gỡ tay ở nhóm sẽ bị thêm lại ở lần chạy kế tiếp.
  // Nhóm RIÊNG với team Account thì vẫn add tay bình thường — cờ này chỉ chặn đúng nhóm chung.
  if (staff.isExternal) return;

  const group = await prisma.conversation.findFirst({ where: { type: "GROUP", name: TCM_FAMILY_GROUP_NAME } });
  if (!group) return; // chưa seed nhóm — bỏ qua, không tự tạo ở đây để tránh tạo trùng khi có nhiều request đồng thời

  const already = await getMembership(group.id, staffId);
  if (already) return;

  await prisma.conversationMember.create({ data: { conversationId: group.id, staffId, role: "MEMBER" } });
  await addSystemMessage(group.id, null, "MEMBER_ADDED", staff.fullName);

  const svg = buildWelcomeSvg(staff.fullName);
  const buffer = Buffer.from(svg, "utf8");
  const attachmentKey = await saveChatAttachment(buffer, "image/svg+xml");
  await prisma.message.create({
    data: {
      conversationId: group.id,
      senderId: null, // hệ thống tự đăng — UI hiện nhãn "TCM" (xem chat-conversation.tsx)
      type: "IMAGE",
      attachmentKey,
      attachmentName: `welcome-${staff.id}.svg`,
      attachmentMime: "image/svg+xml",
      attachmentSize: buffer.byteLength,
    },
  });
}
