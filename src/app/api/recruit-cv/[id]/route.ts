import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readCvFile } from "@/lib/recruit-storage";
import { getRecruitPerms, gateCandidate } from "@/app/(app)/staff/recruit/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Header HTTP chỉ nhận ByteString — tên file tiếng Việt có dấu sẽ ném TypeError nếu nhét thẳng vào
 * Content-Disposition. RFC 6266: `filename` ASCII-safe (fallback) + `filename*` UTF-8 percent-encode.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Serve FILE CV của ứng viên. CV nằm ngoài `public/` nên đây là đường đọc DUY NHẤT.
 *
 * ⚠ Kiểm quyền THEO TỪNG HỒ SƠ bằng `gateCandidate`, không chỉ kiểm một mã quyền phẳng — mirror
 * `/api/project-file/[id]`, KHÔNG mirror `/api/client-kb/[id]` (route đó không kiểm belongs-to,
 * HANDOVER 10.13 đã ghi là nợ phải vá). Ở đây phép kiểm theo bản ghi là BẮT BUỘC ngay từ đầu, vì
 * người phỏng vấn được mở CV mà KHÔNG có mã quyền tuyển dụng nào — nếu chỉ kiểm mã quyền thì hoặc
 * là họ không mở được CV để phỏng vấn, hoặc phải nới mã quyền cho cả công ty.
 *
 * `inline` để HR/người phỏng vấn xem ngay trên trình duyệt (PDF), không phải tải về rồi mở.
 *
 * Route handler = API công khai, phải TỰ kiểm quyền như server action.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const perms = await getRecruitPerms();
  if (!perms.meId) return new NextResponse(null, { status: 401 });

  const gate = await gateCandidate(id, perms);
  if (!gate) return new NextResponse(null, { status: 404 });
  if (!gate.canOpen) return new NextResponse(null, { status: 403 });

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { cvFileKey: true, cvFileMime: true, cvFileName: true },
  });
  if (!candidate) return new NextResponse(null, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await readCvFile(candidate.cvFileKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": candidate.cvFileMime,
      "Content-Disposition": contentDisposition(candidate.cvFileName.replace(/["\\]/g, "_")),
      // CV là dữ liệu cá nhân — cấm cache ở mọi tầng trung gian.
      "Cache-Control": "private, no-store",
      // `cvFileMime` là chuỗi TRÌNH DUYỆT khai lúc upload, không phải kết quả đọc magic byte.
      // nosniff cấm trình duyệt tự đoán lại kiểu — thiếu nó thì file khai sai kiểu chạy được trên
      // chính origin của app.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
