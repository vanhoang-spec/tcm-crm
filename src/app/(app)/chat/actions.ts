"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { buildConversationView, type ConversationView } from "./conversation-data";
import type { ChatListItem, ChatStaff } from "./types";
import {
  getOrCreateDirectConversation,
  getMembership,
  assertMember,
  assertAdmin,
  addSystemMessage,
  markConversationRead,
  notifyNewMessage,
  validateMentionIds,
  previewText,
  listConversationsForForward,
  listConversationsForStaff,
  isSuperAdmin,
  TCM_FAMILY_GROUP_NAME,
  type ForwardTarget,
} from "@/lib/chat";
import {
  saveChatAttachment,
  deleteChatAttachment,
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  VOICE_MIME_TYPES,
  MAX_MEDIA_BYTES,
  MAX_VOICE_BYTES,
  MAX_VOICE_SECONDS,
  MAX_CHAT_FILES,
  MAX_TOTAL_UPLOAD_BYTES,
} from "@/lib/chat-storage";
import { formatDuration } from "@/lib/utils";
import { fetchLinkPreview } from "@/lib/link-preview";
import { requirePermission } from "@/lib/permissions";

export type SendState = { error?: string; ok?: number };

function revalidateConv(conversationId: string) {
  revalidatePath("/chat");
  revalidatePath(`/chat/${conversationId}`);
}

/** Bắt đầu (hoặc mở lại) chat 1-1 rồi điều hướng vào hội thoại. */
export async function startDirectChat(formData: FormData) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  const otherId = String(formData.get("staffId") ?? "");
  if (!meId || !otherId || otherId === meId) return;
  const other = await prisma.staff.findFirst({ where: { id: otherId, isActive: true }, select: { id: true } });
  if (!other) return;
  const conv = await getOrCreateDirectConversation(meId, otherId);
  revalidatePath("/chat");
  redirect(`/chat/${conv.id}`);
}

/** Tạo nhóm mới; người tạo là ADMIN. Sinh system message GROUP_CREATED + MEMBER_ADDED. */
export async function createGroup(formData: FormData) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const name = String(formData.get("name") ?? "").trim();
  const memberIds = formData.getAll("memberIds").map(String).filter((id) => id && id !== meId);
  if (!name || memberIds.length === 0) return;

  const valid = await prisma.staff.findMany({ where: { id: { in: memberIds }, isActive: true }, select: { id: true, fullName: true } });
  const conv = await prisma.conversation.create({
    data: {
      type: "GROUP",
      name,
      createdById: meId,
      members: { create: [{ staffId: meId, role: "ADMIN" }, ...valid.map((s) => ({ staffId: s.id, role: "MEMBER" }))] },
    },
  });
  await addSystemMessage(conv.id, meId, "GROUP_CREATED", null);
  for (const s of valid) await addSystemMessage(conv.id, meId, "MEMBER_ADDED", s.fullName);
  revalidatePath("/chat");
  redirect(`/chat/${conv.id}`);
}

/** Gửi tin nhắn (TEXT hoặc LINK) + mentions + fan-out notification. */
export async function sendMessage(conversationId: string, _prev: SendState, formData: FormData): Promise<SendState> {
  await requirePermission("chat.use");
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const membership = await getMembership(conversationId, meId);
  if (!membership) return { error: t("errNotMember") };

  const kind = String(formData.get("kind") ?? "TEXT");
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, name: true } });
  if (!conv) return { error: t("errNotMember") };
  const me = await prisma.staff.findUnique({ where: { id: meId }, select: { fullName: true } });

  let preview = "";
  let data: {
    type: string;
    body?: string | null;
    linkText?: string | null;
    linkUrl?: string | null;
    linkPreviewTitle?: string | null;
    linkPreviewDescription?: string | null;
    linkPreviewImageUrl?: string | null;
    linkPreviewSiteName?: string | null;
    attachmentKey?: string | null;
    attachmentName?: string | null;
    attachmentMime?: string | null;
    attachmentSize?: number | null;
    attachmentDurationSec?: number | null;
  };
  /** File thứ 2 trở đi khi gửi nhiều file — mỗi phần tử thành MỘT tin nhắn nữa. */
  let extraData: typeof data[] = [];

  if (kind === "LINK") {
    const linkUrl = String(formData.get("linkUrl") ?? "").trim();
    const linkText = String(formData.get("linkText") ?? "").trim();
    if (!/^https?:\/\/.+/i.test(linkUrl)) return { error: t("errLinkUrlRequired") };
    // Unfurl preview (og:title/description/image) — best-effort, không chặn gửi nếu thất bại/timeout.
    const linkPreview = await fetchLinkPreview(linkUrl).catch(() => null);
    data = {
      type: "LINK",
      linkUrl,
      linkText: linkText || linkUrl,
      body: null,
      linkPreviewTitle: linkPreview?.title ?? null,
      linkPreviewDescription: linkPreview?.description ?? null,
      linkPreviewImageUrl: linkPreview?.imageUrl ?? null,
      linkPreviewSiteName: linkPreview?.siteName ?? null,
    };
    preview = linkText || linkUrl;
  } else if (kind === "IMAGE" || kind === "VIDEO" || kind === "VOICE" || kind === "FILE") {
    // ⚠ getAll, KHÔNG get: từ 24/08/2026 người dùng chọn được tối đa MAX_CHAT_FILES file một lần.
    // Mô hình dữ liệu GIỮ NGUYÊN 1 tin = 1 file — nhiều file thì tạo NHIỀU tin trong cùng một lần
    // gửi. Chọn vậy để không phải đụng bảng mới và không phải sửa mọi chỗ render bong bóng tin,
    // preview, route tải file, tìm kiếm. Đổi lại: thông báo phải GỘP một lần (xem cuối hàm), nếu
    // không thì gửi 10 file là 10 thông báo + 10 push bắn vào mặt người nhận.
    const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return { error: t("errFileRequired") };
    // VOICE luôn đúng 1 file (thu âm), không đi đường nhiều file.
    const maxCount = kind === "VOICE" ? 1 : MAX_CHAT_FILES;
    if (files.length > maxCount) return { error: t("errTooManyFiles", { max: maxCount }) };

    // FILE = gửi mọi loại file (không giới hạn theo allowlist) — chỉ IMAGE/VIDEO/VOICE (chọn qua picker
    // riêng, accept="image/*"...) mới kiểm mime chặt để phòng client giả mạo kind.
    const allowedMime = kind === "IMAGE" ? IMAGE_MIME_TYPES : kind === "VIDEO" ? VIDEO_MIME_TYPES : kind === "VOICE" ? VOICE_MIME_TYPES : null;
    const maxBytes = kind === "VOICE" ? MAX_VOICE_BYTES : MAX_MEDIA_BYTES;
    let totalBytes = 0;
    for (const f of files) {
      if (allowedMime && !allowedMime.includes(f.type)) return { error: t("errFileType") };
      if (f.size > maxBytes) return { error: t("errFileTooLarge") };
      totalBytes += f.size;
    }
    // ⚠ Kiểm lại TỔNG ở server dù client đã chặn: request vượt bodySizeLimit thì Next ném 413 trước
    // khi tới đây, nhưng người gọi bằng công cụ khác (hoặc client bị sửa) vẫn phải bị chặn tử tế.
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) return { error: t("errTotalTooLarge", { mb: Math.round(MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024) }) };

    let durationSec: number | null = null;
    if (kind === "VOICE") {
      const raw = Number(formData.get("durationSec") ?? NaN);
      durationSec = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
      if (durationSec && durationSec > MAX_VOICE_SECONDS) return { error: t("errVoiceTooLong") };
    }

    // ⚠ Lưu file TRƯỚC, ghi DB SAU: lưu file là IO chậm (10 file tới 25MB), mà SQLite là
    // single-writer — mở transaction rồi mới ghi đĩa là giữ writer suốt thời gian đó và treo cả app.
    const saved: typeof data[] = [];
    for (const f of files) {
      const buffer = Buffer.from(await f.arrayBuffer());
      const attachmentKey = await saveChatAttachment(buffer, f.type);
      saved.push({
        type: kind,
        body: null,
        attachmentKey,
        attachmentName: f.name || null,
        attachmentMime: f.type,
        attachmentSize: f.size,
        attachmentDurationSec: durationSec,
      });
    }
    data = saved[0];
    extraData = saved.slice(1);
    const firstName = files[0].name || "";
    preview =
      files.length > 1 ? t("previewFiles", { n: files.length }) :
      kind === "IMAGE" ? t("previewImage") :
      kind === "VIDEO" ? t("previewVideo") :
      kind === "FILE" ? t("previewFile", { name: firstName }) :
      t("previewVoice", { duration: formatDuration(durationSec ?? 0) });
  } else {
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return { error: t("errEmptyMessage") };
    data = { type: "TEXT", body };
    preview = body;
  }

  const mentionAll = String(formData.get("mentionAll") ?? "") === "1";
  const rawMentionIds = String(formData.get("mentionIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const mentionStaffIds = mentionAll ? [] : await validateMentionIds(conversationId, rawMentionIds);

  // Reply: chỉ hợp lệ nếu tin gốc thuộc CÙNG hội thoại (không tin client — validate ở đây).
  const rawReplyToId = String(formData.get("replyToId") ?? "").trim();
  let replyToId: string | null = null;
  if (rawReplyToId) {
    const original = await prisma.message.findUnique({ where: { id: rawReplyToId }, select: { conversationId: true } });
    if (original?.conversationId === conversationId) replyToId = rawReplyToId;
  }

  const msg = await prisma.message.create({ data: { conversationId, senderId: meId, replyToId, ...data } });
  // Các file còn lại: mỗi file MỘT tin nhắn nữa, theo đúng thứ tự người dùng chọn.
  // ⚠ KHÔNG gắn `replyToId` cho các tin sau — trả lời một tin mà đính 5 file thì chỉ tin ĐẦU là
  // câu trả lời, 4 tin sau là file kèm theo; gắn hết là khung "đang trả lời" hiện 5 lần.
  // ⚠ KHÔNG gắn mention cho các tin sau (xem khối mention ngay dưới) — nếu không thì @tên nổ N lần.
  for (const d of extraData) {
    await prisma.message.create({ data: { conversationId, senderId: meId, ...d } });
  }
  if (mentionAll) {
    await prisma.messageMention.create({ data: { messageId: msg.id, isAll: true } });
  } else if (mentionStaffIds.length > 0) {
    await prisma.messageMention.createMany({ data: mentionStaffIds.map((sid) => ({ messageId: msg.id, staffId: sid })) });
  }

  await markConversationRead(conversationId, meId);
  await notifyNewMessage({
    conversationId,
    senderId: meId,
    senderName: me?.fullName ?? "—",
    convType: conv.type,
    convName: conv.name,
    preview: previewText(preview),
    mentionStaffIds,
    mentionAll,
  });

  revalidateConv(conversationId);
  return { ok: Date.now() };
}

/**
 * Thêm thành viên (member hoặc admin đều được). `historyAccess` = "FULL" | "FROM_NOW" — chọn cho TOÀN
 * BỘ đợt thêm này có đọc được lịch sử chat cũ hay không. KHÔNG áp dụng cho "GIA ĐÌNH TCM" — nhóm này
 * luôn cho đọc full lịch sử (ép cứng FULL bất kể lựa chọn trên form, xem ensureTcmFamilyMembership()
 * cũng dùng cùng quy tắc cho luồng auto-join).
 */
export async function addMembers(conversationId: string, formData: FormData) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  await assertMember(conversationId, meId);
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, name: true } });
  if (conv?.type !== "GROUP") return;

  const existing = await prisma.conversationMember.findMany({ where: { conversationId }, select: { staffId: true } });
  const existingSet = new Set(existing.map((m) => m.staffId));
  const ids = formData.getAll("memberIds").map(String).filter((id) => id && !existingSet.has(id));
  if (ids.length === 0) return;
  const valid = await prisma.staff.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, fullName: true } });

  const isTcmFamily = conv.name === TCM_FAMILY_GROUP_NAME;
  const historyAccess = String(formData.get("historyAccess") ?? "FULL");
  const historyVisibleFrom = !isTcmFamily && historyAccess === "FROM_NOW" ? new Date() : null;

  await prisma.conversationMember.createMany({ data: valid.map((s) => ({ conversationId, staffId: s.id, role: "MEMBER", historyVisibleFrom })) });
  for (const s of valid) await addSystemMessage(conversationId, meId, "MEMBER_ADDED", s.fullName);
  revalidateConv(conversationId);
}

/** Bổ nhiệm member thành admin (chỉ admin). */
export async function promoteToAdmin(conversationId: string, staffId: string) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  await assertAdmin(conversationId, meId);
  const target = await prisma.conversationMember.findUnique({ where: { conversationId_staffId: { conversationId, staffId } } });
  if (!target || target.role === "ADMIN") return;
  await prisma.conversationMember.update({ where: { conversationId_staffId: { conversationId, staffId } }, data: { role: "ADMIN" } });
  const s = await prisma.staff.findUnique({ where: { id: staffId }, select: { fullName: true } });
  await addSystemMessage(conversationId, meId, "ROLE_PROMOTED", s?.fullName ?? "—");
  revalidateConv(conversationId);
}

/** Đổi tên nhóm (chỉ admin). */
export async function renameGroup(conversationId: string, formData: FormData) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  await assertAdmin(conversationId, meId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.conversation.update({ where: { id: conversationId }, data: { name } });
  await addSystemMessage(conversationId, meId, "GROUP_RENAMED", name);
  revalidateConv(conversationId);
}

/** Rời nhóm (self). Nếu admin cuối rời mà còn member → tự bổ nhiệm member join sớm nhất làm admin. */
export async function leaveConversation(conversationId: string) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const me = await getMembership(conversationId, meId);
  if (!me) return;
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true } });
  if (conv?.type !== "GROUP") return; // không cho rời DIRECT

  const staff = await prisma.staff.findUnique({ where: { id: meId }, select: { fullName: true } });
  await prisma.conversationMember.delete({ where: { conversationId_staffId: { conversationId, staffId: meId } } });
  await addSystemMessage(conversationId, meId, "MEMBER_LEFT", staff?.fullName ?? "—");

  const remaining = await prisma.conversationMember.findMany({ where: { conversationId }, orderBy: { joinedAt: "asc" } });
  // Người cuối cùng rời → nhóm rỗng không ai vào lại được nữa: xóa hẳn (cascade dọn message/pin/poll).
  // Riêng "GIA ĐÌNH TCM" giữ lại — hệ thống phụ thuộc theo TÊN (auto-join nhân sự, tin chúc mừng).
  if (remaining.length === 0) {
    const convName = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { name: true } });
    if (convName?.name !== TCM_FAMILY_GROUP_NAME) {
      await prisma.conversation.delete({ where: { id: conversationId } });
    }
    revalidatePath("/chat");
    redirect("/chat");
  }
  if (remaining.length > 0 && !remaining.some((m) => m.role === "ADMIN")) {
    const heir = remaining[0];
    await prisma.conversationMember.update({ where: { id: heir.id }, data: { role: "ADMIN" } });
    const heirStaff = await prisma.staff.findUnique({ where: { id: heir.staffId }, select: { fullName: true } });
    await addSystemMessage(conversationId, null, "ROLE_PROMOTED", heirStaff?.fullName ?? "—");
  }
  revalidatePath("/chat");
  redirect("/chat");
}

export type DisbandState = { error?: string };

/**
 * Giải tán nhóm (chỉ admin) — xóa hẳn Conversation, cascade xóa toàn bộ member/message/reaction/
 * pin/poll/reminder liên quan (đã khai báo onDelete: Cascade trong schema). "GIA ĐÌNH TCM" được bảo
 * vệ khỏi giải tán vì nhiều tính năng hệ thống phụ thuộc vào nó theo TÊN (auto-join nhân sự mới —
 * ensureTcmFamilyMembership, tin chúc mừng tự động — lib/occasions.ts).
 */
export async function disbandGroup(conversationId: string): Promise<DisbandState> {
  await requirePermission("chat.moderate");
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, name: true } });
  if (conv?.type !== "GROUP") return { error: t("errNotMember") };
  if (conv.name === TCM_FAMILY_GROUP_NAME) return { error: t("errCannotDisbandTcmFamily") };
  await assertAdmin(conversationId, meId);

  await prisma.conversation.delete({ where: { id: conversationId } });
  revalidatePath("/chat");
  redirect("/chat");
}

export type DissolveDirectState = { error?: string };

/**
 * Giải tán hội thoại 1-1 (DIRECT) — 1 trong 2 người tham gia đều được, không cần là admin (DIRECT
 * không có role ADMIN — cả 2 luôn là MEMBER, xem getOrCreateDirectConversation). Cascade xóa toàn bộ
 * tin nhắn cho CẢ 2 người, giống hệt disbandGroup.
 */
export async function dissolveDirectConversation(conversationId: string): Promise<DissolveDirectState> {
  await requirePermission("chat.moderate");
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  await assertMember(conversationId, meId);
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true } });
  if (conv?.type !== "DIRECT") return { error: t("errNotMember") };

  await prisma.conversation.delete({ where: { id: conversationId } });
  revalidatePath("/chat");
  redirect("/chat");
}

/**
 * Admin xóa 1 thành viên bất kỳ khỏi nhóm (khác leaveConversation — đó là tự rời). Không cho tự xóa
 * chính mình (dùng "Rời nhóm"), không cho xóa khỏi "GIA ĐÌNH TCM" (nhóm hệ thống, mọi nhân sự active
 * đều phải có mặt — ensureTcmFamilyMembership sẽ tự thêm lại vào lần "act as" kế tiếp, gây nhiễu).
 */
export async function removeMember(conversationId: string, staffId: string) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId || staffId === meId) return;
  await assertAdmin(conversationId, meId);
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, name: true } });
  if (conv?.type !== "GROUP" || conv.name === TCM_FAMILY_GROUP_NAME) return;

  const target = await prisma.conversationMember.findUnique({ where: { conversationId_staffId: { conversationId, staffId } } });
  if (!target) return;
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { fullName: true } });
  await prisma.conversationMember.delete({ where: { conversationId_staffId: { conversationId, staffId } } });
  await addSystemMessage(conversationId, meId, "MEMBER_REMOVED", staff?.fullName ?? "—");
  revalidateConv(conversationId);
}

/** Đổi avatar nhóm (chỉ admin) — lưu qua chat-storage như các đính kèm khác. */
export async function updateGroupAvatar(conversationId: string, formData: FormData): Promise<{ error?: string }> {
  await requirePermission("chat.use");
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true } });
  if (conv?.type !== "GROUP") return { error: t("errNotMember") };
  await assertAdmin(conversationId, meId);

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: t("errFileRequired") };
  if (!IMAGE_MIME_TYPES.includes(file.type)) return { error: t("errFileType") };
  if (file.size > MAX_MEDIA_BYTES) return { error: t("errFileTooLarge") };

  const buffer = Buffer.from(await file.arrayBuffer());
  const avatarKey = await saveChatAttachment(buffer, file.type);
  await prisma.conversation.update({ where: { id: conversationId }, data: { avatarKey } });
  revalidateConv(conversationId);
  return {};
}

/** Ghim/bỏ ghim hội thoại lên đầu danh sách CỦA RIÊNG người đang thao tác (không ảnh hưởng người khác). */
export async function toggleConversationPin(conversationId: string) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const m = await getMembership(conversationId, meId);
  if (!m) return;
  await prisma.conversationMember.update({
    where: { conversationId_staffId: { conversationId, staffId: meId } },
    data: { sidebarPinnedAt: m.sidebarPinnedAt ? null : new Date() },
  });
  revalidatePath("/chat");
}

/** Bật/tắt thông báo cho chính mình trong hội thoại. */
export async function toggleMute(conversationId: string) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const m = await getMembership(conversationId, meId);
  if (!m) return;
  await prisma.conversationMember.update({
    where: { conversationId_staffId: { conversationId, staffId: meId } },
    data: { notificationsMuted: !m.notificationsMuted },
  });
  revalidateConv(conversationId);
}

/** Đánh dấu đã đọc (dùng khi mở hoặc khi poll nhận tin mới). */
export async function markRead(conversationId: string) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  await markConversationRead(conversationId, meId);
  revalidatePath("/chat");
}

/**
 * Reaction kiểu Messenger — mỗi người chỉ 1 emoji/tin nhắn: bấm emoji mới = ghi đè, bấm lại đúng
 * emoji đang chọn = gỡ. Gọi trực tiếp từ client component (không phải form action).
 */
export async function toggleReaction(messageId: string, emoji: string) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
  if (!message) return;
  await assertMember(message.conversationId, meId);

  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_staffId: { messageId, staffId: meId } },
  });
  if (existing && existing.emoji === emoji) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
  } else if (existing) {
    await prisma.messageReaction.update({ where: { id: existing.id }, data: { emoji } });
  } else {
    await prisma.messageReaction.create({ data: { messageId, staffId: meId, emoji } });
  }
  revalidateConv(message.conversationId);
}

const MAX_PINNED_PER_CONVERSATION = 3;

export type EditState = { error?: string; ok?: number };

/** Sửa nội dung tin nhắn — chỉ sender, chỉ khi còn TEXT và chưa bị xóa. Đánh dấu editedAt. */
export async function editMessage(messageId: string, body: string): Promise<EditState> {
  await requirePermission("chat.use");
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const trimmed = body.trim();
  if (!trimmed) return { error: t("errEmptyMessage") };

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.senderId !== meId) return { error: t("errNotMember") };
  if (message.type !== "TEXT" || message.deletedForEveryoneAt) return { error: t("errEditNotAllowed") };

  await prisma.message.update({ where: { id: messageId }, data: { body: trimmed, editedAt: new Date() } });
  revalidateConv(message.conversationId);
  return { ok: Date.now() };
}

/** "Delete for me" — chỉ ẩn tin nhắn khỏi chính người xóa (mọi thành viên, kể cả tin của người khác). */
export async function deleteMessageForMe(messageId: string) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
  if (!message) return;
  await assertMember(message.conversationId, meId);
  await prisma.messageDeletion.upsert({
    where: { messageId_staffId: { messageId, staffId: meId } },
    update: {},
    create: { messageId, staffId: meId },
  });
  revalidateConv(message.conversationId);
}

/**
 * "Delete for everyone" — sender HOẶC admin nhóm. Xóa sạch nội dung (body/link/attachment) khỏi
 * record, giữ lại tombstone (deletedForEveryoneAt) để tin vẫn hiện "đã bị xóa" thay vì biến mất
 * (tránh vỡ chuỗi reply/pin trỏ tới nó). Dọn kèm file đính kèm trên disk + gỡ pin + reaction.
 */
export async function deleteMessageForEveryone(messageId: string) {
  await requirePermission("chat.moderate");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.deletedForEveryoneAt) return;

  const membership = await assertMember(message.conversationId, meId);
  const isSender = message.senderId === meId;
  const isAdmin = membership.role === "ADMIN";
  if (!isSender && !isAdmin) return;

  if (message.attachmentKey) await deleteChatAttachment(message.attachmentKey);

  await prisma.$transaction([
    prisma.pinnedMessage.deleteMany({ where: { messageId } }),
    prisma.messageReaction.deleteMany({ where: { messageId } }),
    prisma.message.update({
      where: { id: messageId },
      data: {
        deletedForEveryoneAt: new Date(),
        deletedById: meId,
        body: null,
        linkUrl: null,
        linkText: null,
        linkPreviewTitle: null,
        linkPreviewDescription: null,
        linkPreviewImageUrl: null,
        linkPreviewSiteName: null,
        attachmentKey: null,
        attachmentName: null,
        attachmentMime: null,
        attachmentSize: null,
        attachmentDurationSec: null,
      },
    }),
  ]);
  revalidateConv(message.conversationId);
}

export type PinState = { error?: string; ok?: number };

/** Ghim tin nhắn lên đầu hội thoại — tối đa 3 tin/hội thoại tại 1 thời điểm. Bất kỳ thành viên. */
export async function pinMessage(conversationId: string, messageId: string): Promise<PinState> {
  await requirePermission("chat.use");
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  await assertMember(conversationId, meId);

  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true, deletedForEveryoneAt: true } });
  if (!message || message.conversationId !== conversationId || message.deletedForEveryoneAt) return { error: t("errPinInvalid") };

  const count = await prisma.pinnedMessage.count({ where: { conversationId } });
  if (count >= MAX_PINNED_PER_CONVERSATION) return { error: t("errPinLimitReached", { max: MAX_PINNED_PER_CONVERSATION }) };

  await prisma.pinnedMessage.upsert({
    where: { conversationId_messageId: { conversationId, messageId } },
    update: {},
    create: { conversationId, messageId, pinnedById: meId },
  });
  revalidateConv(conversationId);
  return { ok: Date.now() };
}

/** Gỡ ghim — bất kỳ thành viên. */
export async function unpinMessage(conversationId: string, messageId: string) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  await assertMember(conversationId, meId);
  await prisma.pinnedMessage.deleteMany({ where: { conversationId, messageId } });
  revalidateConv(conversationId);
}

export type ReminderState = { error?: string; ok?: number };
const REMINDER_RECURRENCES = ["ONCE", "DAILY", "WEEKLY", "MONTHLY"];
const REMINDER_AUDIENCES = ["ME", "GROUP"];

/** Tạo nhắc hẹn — đăng ngay 1 message type=REMINDER làm thông báo lịch; "đến hẹn" xử lý ở lib/chat-reminders.ts. */
export async function createReminder(conversationId: string, _prev: ReminderState, formData: FormData): Promise<ReminderState> {
  await requirePermission("chat.use");
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const membership = await getMembership(conversationId, meId);
  if (!membership) return { error: t("errNotMember") };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: t("errReminderTitleRequired") };
  const remindAtRaw = String(formData.get("remindAt") ?? "");
  const remindAt = remindAtRaw ? new Date(remindAtRaw) : null;
  if (!remindAt || Number.isNaN(remindAt.getTime())) return { error: t("errReminderTimeRequired") };
  if (remindAt.getTime() <= Date.now()) return { error: t("errReminderTimeMustBeFuture") };
  const recurrence = String(formData.get("recurrence") ?? "ONCE");
  const audience = String(formData.get("audience") ?? "ME");
  if (!REMINDER_RECURRENCES.includes(recurrence) || !REMINDER_AUDIENCES.includes(audience)) return { error: t("errReminderTimeRequired") };

  const msg = await prisma.message.create({ data: { conversationId, senderId: meId, type: "REMINDER" } });
  await prisma.reminder.create({ data: { conversationId, messageId: msg.id, createdById: meId, title, remindAt, recurrence, audience } });

  const me = await prisma.staff.findUnique({ where: { id: meId }, select: { fullName: true } });
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, name: true } });
  await markConversationRead(conversationId, meId);
  await notifyNewMessage({
    conversationId,
    senderId: meId,
    senderName: me?.fullName ?? "—",
    convType: conv?.type ?? "GROUP",
    convName: conv?.name ?? null,
    preview: t("reminderPreview", { title }),
    mentionStaffIds: [],
    mentionAll: false,
  });

  revalidateConv(conversationId);
  return { ok: Date.now() };
}

export type PollState = { error?: string; ok?: number };

/** Tạo bình chọn — ≥2 phương án bắt buộc lúc tạo; các setting theo yêu cầu (allowMultiple/anonymous/hideResultsUntilVoted/allowAddOptions/closesAt). */
export async function createPoll(conversationId: string, _prev: PollState, formData: FormData): Promise<PollState> {
  await requirePermission("chat.use");
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const membership = await getMembership(conversationId, meId);
  if (!membership) return { error: t("errNotMember") };

  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { error: t("errPollQuestionRequired") };
  const options = formData
    .getAll("options")
    .map((o) => String(o).trim())
    .filter(Boolean);
  if (options.length < 2) return { error: t("errPollMinOptions") };

  const allowMultiple = String(formData.get("allowMultiple") ?? "") === "1";
  const anonymous = String(formData.get("anonymous") ?? "") === "1";
  const hideResultsUntilVoted = String(formData.get("hideResultsUntilVoted") ?? "") === "1";
  const allowAddOptions = String(formData.get("allowAddOptions") ?? "") === "1";
  const closesAtRaw = String(formData.get("closesAt") ?? "");
  const closesAt = closesAtRaw ? new Date(closesAtRaw) : null;
  if (closesAt && (Number.isNaN(closesAt.getTime()) || closesAt.getTime() <= Date.now())) return { error: t("errPollClosesAtInvalid") };

  const msg = await prisma.message.create({ data: { conversationId, senderId: meId, type: "POLL" } });
  await prisma.poll.create({
    data: {
      messageId: msg.id,
      question,
      allowMultiple,
      anonymous,
      hideResultsUntilVoted,
      allowAddOptions,
      closesAt,
      createdById: meId,
      options: { create: options.map((text, i) => ({ text, sort: i })) },
    },
  });

  const me = await prisma.staff.findUnique({ where: { id: meId }, select: { fullName: true } });
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, name: true } });
  await markConversationRead(conversationId, meId);
  await notifyNewMessage({
    conversationId,
    senderId: meId,
    senderName: me?.fullName ?? "—",
    convType: conv?.type ?? "GROUP",
    convName: conv?.name ?? null,
    preview: t("pollPreview", { question }),
    mentionStaffIds: [],
    mentionAll: false,
  });

  revalidateConv(conversationId);
  return { ok: Date.now() };
}

/** Vote/gỡ vote 1 phương án — single-choice thì vote mới tự thay vote cũ (allowMultiple=false). */
export async function votePollOption(pollOptionId: string) {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const option = await prisma.pollOption.findUnique({
    where: { id: pollOptionId },
    include: { poll: { include: { message: { select: { conversationId: true } } } } },
  });
  if (!option) return;
  const conversationId = option.poll.message.conversationId;
  await assertMember(conversationId, meId);
  if (option.poll.closesAt && option.poll.closesAt.getTime() <= Date.now()) return;

  const existing = await prisma.pollVote.findUnique({ where: { pollOptionId_staffId: { pollOptionId, staffId: meId } } });
  if (existing) {
    await prisma.pollVote.delete({ where: { id: existing.id } });
  } else {
    if (!option.poll.allowMultiple) {
      await prisma.pollVote.deleteMany({ where: { staffId: meId, pollOption: { pollId: option.pollId } } });
    }
    await prisma.pollVote.create({ data: { pollOptionId, staffId: meId } });
  }
  revalidateConv(conversationId);
}

export type AddPollOptionState = { error?: string };

/** Thêm phương án mới vào poll đang mở — chỉ khi poll bật allowAddOptions và chưa đóng. */
export async function addPollOption(pollId: string, text: string): Promise<AddPollOptionState> {
  await requirePermission("chat.use");
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: { message: { select: { conversationId: true } } } });
  if (!poll) return { error: t("errPollInvalid") };
  const conversationId = poll.message.conversationId;
  const membership = await getMembership(conversationId, meId);
  if (!membership) return { error: t("errNotMember") };
  if (!poll.allowAddOptions) return { error: t("errPollAddOptionNotAllowed") };
  if (poll.closesAt && poll.closesAt.getTime() <= Date.now()) return { error: t("errPollClosed") };
  const trimmed = text.trim();
  if (!trimmed) return { error: t("errPollOptionRequired") };

  const count = await prisma.pollOption.count({ where: { pollId } });
  await prisma.pollOption.create({ data: { pollId, text: trimmed, sort: count, addedById: meId } });
  revalidateConv(conversationId);
  return {};
}

/** Danh sách hội thoại của tôi cho picker "Chuyển tiếp" (gọi trực tiếp từ client component). */
export async function getForwardTargets(): Promise<ForwardTarget[]> {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return [];
  return listConversationsForForward(meId);
}

export type ForwardState = { error?: string; ok?: number };

/**
 * Chuyển tiếp 1 tin nhắn sang hội thoại khác — tạo bản ghi ĐỘC LẬP (copy nội dung, không giữ
 * liên kết ngược tới tin gốc) để không lộ nội dung/quyền xem của hội thoại nguồn sang hội thoại đích.
 * Người chuyển tiếp phải là thành viên CẢ 2 bên (thấy được tin gốc + gửi được ở đích).
 */
export async function forwardMessage(messageId: string, targetConversationId: string): Promise<ForwardState> {
  await requirePermission("chat.use");
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };

  const original = await prisma.message.findUnique({ where: { id: messageId } });
  // REMINDER/POLL không cho chuyển tiếp — nội dung thật nằm ở bảng Reminder/Poll riêng (1-1 theo
  // messageId), forward kiểu copy body/link như các loại khác sẽ tạo ra 1 message rỗng, gãy.
  if (!original || ["SYSTEM", "REMINDER", "POLL"].includes(original.type)) return { error: t("errForwardInvalid") };
  await assertMember(original.conversationId, meId);

  const targetMembership = await getMembership(targetConversationId, meId);
  if (!targetMembership) return { error: t("errNotMember") };
  const conv = await prisma.conversation.findUnique({ where: { id: targetConversationId }, select: { type: true, name: true } });
  if (!conv) return { error: t("errNotMember") };
  const me = await prisma.staff.findUnique({ where: { id: meId }, select: { fullName: true } });

  await prisma.message.create({
    data: {
      conversationId: targetConversationId,
      senderId: meId,
      type: original.type,
      body: original.body,
      linkUrl: original.linkUrl,
      linkText: original.linkText,
      attachmentKey: original.attachmentKey,
      attachmentName: original.attachmentName,
      attachmentMime: original.attachmentMime,
      attachmentSize: original.attachmentSize,
      attachmentDurationSec: original.attachmentDurationSec,
      isForwarded: true,
    },
  });

  const preview =
    original.type === "IMAGE" ? t("previewImage") :
    original.type === "VIDEO" ? t("previewVideo") :
    original.type === "FILE" ? t("previewFile", { name: original.attachmentName ?? "" }) :
    original.type === "VOICE" ? t("previewVoice", { duration: formatDuration(original.attachmentDurationSec ?? 0) }) :
    original.type === "LINK" ? (original.linkText || original.linkUrl || "") :
    (original.body ?? "");

  await markConversationRead(targetConversationId, meId);
  await notifyNewMessage({
    conversationId: targetConversationId,
    senderId: meId,
    senderName: me?.fullName ?? "—",
    convType: conv.type,
    convName: conv.name,
    preview: previewText(preview),
    mentionStaffIds: [],
    mentionAll: false,
  });

  revalidateConv(targetConversationId);
  return { ok: Date.now() };
}

// ─────────────────────────────────────────────────────────
// Hộp chat nổi — nạp dữ liệu theo yêu cầu thay vì qua điều hướng.
// Dùng CHUNG buildConversationView với trang /chat/[id] để hai đường không lệch nhau.
// ─────────────────────────────────────────────────────────

/** Danh sách hội thoại + nhân sự cho bảng chọn của dock. */
export async function loadChatDock(): Promise<{ list: ChatListItem[]; staff: ChatStaff[]; superAdmin: boolean }> {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  if (!meId) return { list: [], staff: [], superAdmin: false };

  const [items, superAdmin, staffRows] = await Promise.all([
    listConversationsForStaff(meId),
    isSuperAdmin(meId),
    prisma.staff.findMany({ where: { isActive: true }, select: { id: true, fullName: true, title: true }, orderBy: { fullName: "asc" } }),
  ]);

  return {
    list: items.map((i) => ({
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
    })),
    staff: staffRows.filter((s) => s.id !== meId).map((s) => ({ id: s.id, fullName: s.fullName, title: s.title })),
    superAdmin,
  };
}

/** Toàn bộ dữ liệu một hội thoại cho hộp nổi. null = không tồn tại hoặc không được xem. */
export async function loadChatPanel(conversationId: string): Promise<ConversationView | null> {
  await requirePermission("chat.use");
  const meId = await getCurrentStaffId();
  return buildConversationView(conversationId, meId);
}
