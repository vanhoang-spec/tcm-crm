import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { readAiFile } from "@/lib/ai-file-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Header HTTP chỉ nhận ByteString — tên file tiếng Việt có dấu sẽ ném TypeError nếu nhét thẳng vào
 * Content-Disposition. RFC 6266: `filename` ASCII-safe (fallback) + `filename*` UTF-8 percent-encode.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Tải file đính kèm CẤP DỰ ÁN (`ProjectFile`).
 *
 * Trước 08/2026 KHÔNG có route nào serve `ProjectFile`: file upload ở module AI chỉ để model đọc,
 * người dùng không lấy lại được. Sổ đăng ký hồ sơ ISO cần tải về nên mở đường này.
 *
 * ⚠ BẮT BUỘC KIỂM QUYỀN THEO DỰ ÁN, không chỉ kiểm mã quyền phẳng. HANDOVER 10.13 ghi lại đúng lỗ
 * này ở `/api/client-kb/[id]`: route đó không kiểm tài liệu thuộc khách nào, và ghi rõ "ngày nào siết
 * phạm vi theo team thì phải vá nó trước". Đừng đẻ thêm một route cùng lỗ.
 *
 * Route handler = API công khai, phải TỰ kiểm quyền như server action — không dựa vào trang gọi nó.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });
  if (!(await hasPermission("iso.view")) && !(await hasPermission("projects.view"))) {
    return new NextResponse(null, { status: 403 });
  }

  const file = await prisma.projectFile.findUnique({
    where: { id },
    select: {
      fileKey: true,
      fileMime: true,
      fileName: true,
      // Kéo theo dự án để (a) chốt file thuộc một dự án CÓ THẬT, (b) sẵn chỗ siết phạm vi theo team
      // khi nào cần — lúc đó chỉ phải sửa đúng điều kiện dưới, không phải đi tìm lại route.
      project: { select: { id: true } },
    },
  });
  if (!file || !file.project) return new NextResponse(null, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await readAiFile(file.fileKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": file.fileMime,
      "Content-Disposition": contentDisposition(file.fileName.replace(/["\\]/g, "_")),
      "Cache-Control": "private, no-store",
      // `fileMime` là chuỗi TRÌNH DUYỆT khai lúc upload, không phải kết quả đọc magic byte. nosniff
      // cấm trình duyệt tự đoán lại kiểu — thiếu nó thì một file khai sai kiểu chạy được trên origin app.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
