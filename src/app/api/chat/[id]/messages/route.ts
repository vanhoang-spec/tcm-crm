import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { getMembership, isSuperAdmin, groupReactions, buildPollView } from "@/lib/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polling endpoint — client tự gọi mỗi ~N giây khi mở hội thoại để lấy tin nhắn mới.
 * (App chưa có realtime; đây là cơ chế "gần realtime" đơn giản.)
 * Guard: phải là thành viên, hoặc super-admin (xem read-only).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const membership = await getMembership(conversationId, meId);
  if (!membership && !(await isSuperAdmin(meId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const after = req.nextUrl.searchParams.get("after");
  const afterDate = after ? new Date(after) : null;
  const validAfter = afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : null;

  const [messages, members, reactions, pinnedRows, updatedRows, pollRows, reminderRows] = await Promise.all([
    prisma.message.findMany({
      where: {
        conversationId,
        ...(validAfter || membership?.historyVisibleFrom
          ? {
              createdAt: {
                ...(validAfter ? { gt: validAfter } : {}),
                ...(membership?.historyVisibleFrom ? { gte: membership.historyVisibleFrom } : {}),
              },
            }
          : {}),
        deletions: { none: { staffId: meId } }, // "Delete for me" — không trả tin đã bị chính người này ẩn
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        sender: { select: { id: true, fullName: true } },
        mentions: { include: { staff: { select: { id: true, fullName: true } } } },
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
    }),
    // Trạng thái "đã đọc" của từng thành viên — trả kèm MỖI lần poll (kể cả khi không có tin mới)
    // để các tin nhắn CŨ trên màn hình cũng cập nhật được "đã xem bởi ai" khi người khác mở hội thoại sau đó.
    prisma.conversationMember.findMany({
      where: { conversationId },
      select: { staffId: true, lastReadAt: true, staff: { select: { fullName: true } } },
    }),
    // Reaction có thể phát sinh trên tin CŨ (không nằm trong khoảng "after") — trả TOÀN BỘ reaction
    // của hội thoại mỗi lần poll (giống read-state) để client vá lại đúng tin, không chỉ tin mới.
    prisma.messageReaction.findMany({
      where: { message: { conversationId } },
      select: { messageId: true, emoji: true, staffId: true, staff: { select: { fullName: true } } },
    }),
    // Tin đã ghim — trả TOÀN BỘ mỗi lần poll (giống reaction/read-state), tối đa 3 nên rẻ.
    prisma.pinnedMessage.findMany({
      where: { conversationId },
      orderBy: { pinnedAt: "asc" },
      include: {
        message: {
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
        pinnedBy: { select: { fullName: true } },
      },
    }),
    // Tin đã sửa/xóa-cho-tất-cả có thể nằm NGOÀI khoảng "after" (tin cũ đã tải) — trả riêng 1 kênh
    // "updated" mỗi lần poll (giống reaction/pin) để client vá lại đúng tin thay vì chỉ tin mới.
    prisma.message.findMany({
      where: { conversationId, OR: [{ editedAt: { not: null } }, { deletedForEveryoneAt: { not: null } }] },
      select: {
        id: true,
        body: true,
        linkUrl: true,
        linkText: true,
        linkPreviewTitle: true,
        linkPreviewDescription: true,
        linkPreviewImageUrl: true,
        linkPreviewSiteName: true,
        attachmentName: true,
        attachmentMime: true,
        attachmentSize: true,
        attachmentDurationSec: true,
        editedAt: true,
        deletedForEveryoneAt: true,
      },
    }),
    // Poll có thể nhận vote mới trên tin CŨ — trả TOÀN BỘ poll của hội thoại mỗi lần poll (giống
    // reaction/pin), số lượng poll/hội thoại nhỏ nên rẻ.
    prisma.poll.findMany({
      where: { message: { conversationId } },
      include: { options: { orderBy: { sort: "asc" }, include: { votes: { include: { staff: { select: { fullName: true } } } } } } },
    }),
    // Reminder có thể đổi remindAt/isActive sau khi "đến hẹn" (xem lib/chat-reminders.ts) — trả toàn bộ.
    prisma.reminder.findMany({ where: { conversationId } }),
  ]);

  const pinnedMessageIds = new Set(pinnedRows.map((p) => p.messageId));
  const pollsByMessageId: Record<string, ReturnType<typeof buildPollView>> = {};
  for (const p of pollRows) pollsByMessageId[p.messageId] = buildPollView(p, p.options, meId);
  const remindersByMessageId: Record<string, { id: string; title: string; remindAt: string; recurrence: string; audience: string; isActive: boolean }> = {};
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

  const reactionsByMessageId: Record<string, ReturnType<typeof groupReactions>> = {};
  const byMessage = new Map<string, typeof reactions>();
  for (const r of reactions) {
    const arr = byMessage.get(r.messageId) ?? [];
    arr.push(r);
    byMessage.set(r.messageId, arr);
  }
  for (const [msgId, rows] of byMessage) {
    reactionsByMessageId[msgId] = groupReactions(rows, meId);
  }

  return NextResponse.json({
    messages: messages.map((m) => ({
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
      reactions: reactionsByMessageId[m.id] ?? [],
      reminder: remindersByMessageId[m.id] ?? null,
      poll: pollsByMessageId[m.id] ?? null,
    })),
    members: members.map((mem) => ({
      staffId: mem.staffId,
      fullName: mem.staff.fullName,
      lastReadAt: mem.lastReadAt ? mem.lastReadAt.toISOString() : null,
    })),
    reactions: reactionsByMessageId,
    pinned: pinnedRows.map((p) => ({
      id: p.id,
      messageId: p.messageId,
      type: p.message.type,
      senderName: p.message.sender?.fullName ?? null,
      body: p.message.body,
      linkText: p.message.linkText,
      attachmentName: p.message.attachmentName,
      attachmentDurationSec: p.message.attachmentDurationSec,
      pinnedByName: p.pinnedBy?.fullName ?? null,
    })),
    updated: updatedRows.map((m) => ({
      id: m.id,
      body: m.body,
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
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      deletedForEveryone: !!m.deletedForEveryoneAt,
    })),
    polls: pollsByMessageId,
    reminders: remindersByMessageId,
    serverTime: new Date().toISOString(),
  });
}
