import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polling endpoint riêng cho popup thông báo hệ điều hành (Web Notification API) — client tự gọi
 * định kỳ để phát hiện Notification chưa đọc MỚI phát sinh sau lần poll trước, rồi tự bắn popup.
 * Chỉ phủ các Notification đã lưu DB (type != CHAT_MESSAGE, chat có kênh polling riêng); các mục
 * "nhắc việc" thuần computed (care/bidding/AR quá hạn...) không có ở đây — xem đầy đủ ở /reminders.
 */
export async function GET(req: NextRequest) {
  const staffId = await getCurrentStaffId();
  if (!staffId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const after = req.nextUrl.searchParams.get("after");
  const afterDate = after ? new Date(after) : null;
  const validAfter = afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : null;

  const rows = await prisma.notification.findMany({
    where: {
      recipientStaffId: staffId,
      isRead: false,
      type: { not: "CHAT_MESSAGE" },
      ...(validAfter ? { createdAt: { gt: validAfter } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, title: true, body: true, projectId: true, createdAt: true },
  });

  return NextResponse.json({
    notifications: rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      url: n.projectId ? `/projects/${n.projectId}` : "/reminders",
      createdAt: n.createdAt.toISOString(),
    })),
    serverTime: new Date().toISOString(),
  });
}
