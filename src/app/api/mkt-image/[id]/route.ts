import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { readMktFile } from "@/lib/mkt-storage";

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
 * Serve ẢNH của bài đăng MKT. Ảnh nằm ngoài `public/` nên đây là đường đọc DUY NHẤT.
 *
 * `inline` chứ không `attachment` (khác route project-file): ảnh này hiện thành thumbnail ngay trên
 * trang chi tiết bài, tải về là ca phụ.
 *
 * ⚠ Kiểm bài mà ảnh thuộc về ngay từ đầu — mirror `/api/project-file/[id]`, KHÔNG mirror
 * `/api/client-kb/[id]` (route đó không kiểm belongs-to, HANDOVER 10.13 đã ghi là nợ phải vá).
 * Hôm nay `mkt.view` là quyền phẳng toàn công ty nên phép kiểm này chưa lọc thêm ai, nhưng nó là
 * chỗ neo sẵn: ngày nào siết phạm vi (chỉ HR + người tạo bài) thì sửa đúng một điều kiện dưới đây.
 *
 * Route handler = API công khai, phải TỰ kiểm quyền như server action.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });
  if (!(await hasPermission("mkt.view"))) return new NextResponse(null, { status: 403 });

  const image = await prisma.mktPostImage.findUnique({
    where: { id },
    select: {
      fileKey: true,
      fileMime: true,
      fileName: true,
      post: { select: { id: true } },
    },
  });
  if (!image || !image.post) return new NextResponse(null, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await readMktFile(image.fileKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": image.fileMime,
      "Content-Disposition": contentDisposition(image.fileName.replace(/["\\]/g, "_")),
      "Cache-Control": "private, no-store",
      // `fileMime` là chuỗi TRÌNH DUYỆT khai lúc upload, không phải kết quả đọc magic byte. nosniff
      // cấm trình duyệt tự đoán lại kiểu — thiếu nó thì file khai sai kiểu chạy được trên origin app.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
