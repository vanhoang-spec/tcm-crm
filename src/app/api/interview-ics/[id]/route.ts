import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { buildIcs, icsFilename } from "@/lib/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tải file lịch (.ics) của MỘT lượt phỏng vấn — mở ra là Google Calendar / Outlook / lịch điện
 * thoại hỏi "thêm vào lịch?".
 *
 * Vì sao là file chứ không phải nối API Google (quyết định chủ dự án 06/08/2026): xem chú thích
 * đầu `lib/ics.ts`.
 *
 * ⚠ Ai tải được: NGƯỜI PHỎNG VẤN của chính lượt đó, người đã đặt lịch, hoặc người có quyền quản lý
 * lịch phỏng vấn. Kiểm theo BẢN GHI vì người phỏng vấn không có mã quyền tuyển dụng nào.
 *
 * ⚠ Nội dung file CỐ Ý chỉ có tên ứng viên + vị trí + địa điểm. Không đưa điện thoại/email/lương
 * vào: file lịch rời khỏi app ngay khi tải về, nó nằm trên máy cá nhân và đồng bộ lên dịch vụ lịch
 * của người dùng — mọi lớp phân quyền của app hết hiệu lực từ đó.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });

  const interview = await prisma.interview.findUnique({
    where: { id },
    select: {
      id: true,
      round: true,
      scheduledAt: true,
      durationMin: true,
      location: true,
      status: true,
      interviewerStaffId: true,
      createdById: true,
      candidate: { select: { fullName: true, position: { select: { title: true } } } },
    },
  });
  if (!interview) return new NextResponse(null, { status: 404 });

  const mine = interview.interviewerStaffId === meId || interview.createdById === meId;
  if (!mine && !(await hasPermission("recruit.interview.manage"))) {
    return new NextResponse(null, { status: 403 });
  }
  if (interview.status === "CANCELLED") return new NextResponse(null, { status: 404 });

  const summary = `Phỏng vấn vòng ${interview.round} — ${interview.candidate.fullName} (${interview.candidate.position.title})`;
  const ics = buildIcs({
    // UID bất biến theo id lượt phỏng vấn: tải lại file sau khi đổi giờ thì lịch CẬP NHẬT chứ
    // không đẻ thêm một sự kiện thứ hai.
    uid: `interview-${interview.id}@tcmbtl.com`,
    start: interview.scheduledAt,
    durationMin: interview.durationMin,
    summary,
    location: interview.location ?? undefined,
    description: `Vị trí: ${interview.candidate.position.title}`,
    stamp: new Date(),
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFilename(`phong-van-vong-${interview.round}-${interview.candidate.fullName}`)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
