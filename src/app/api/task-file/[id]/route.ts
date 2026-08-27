import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { readTaskFile } from "@/lib/task-storage";
import { taskVisibleWhere } from "@/lib/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Header HTTP chỉ nhận ByteString — tên file tiếng Việt có dấu ném TypeError nếu nhét thẳng vào
 * Content-Disposition (bài học file chat, HANDOVER 10.66). RFC 6266: filename ASCII + filename*.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Tải file đính kèm của module Tasks.
 *
 * ⚠ KIỂM PHẠM VI THEO BẢN GHI bằng ĐÚNG `taskVisibleWhere` của trang (một nguồn sự thật) — mirror
 * `/api/project-file/[id]`, KHÔNG mirror `/api/client-kb/[id]` (lỗ đã ghi ở HANDOVER 10.13).
 * Route handler = API công khai, tự kiểm quyền như server action.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });
  if (!(await hasPermission("tasks.use"))) return new NextResponse(null, { status: 403 });

  const file = await prisma.taskFile.findUnique({
    where: { id },
    select: { fileKey: true, fileMime: true, fileName: true, taskId: true },
  });
  if (!file) return new NextResponse(null, { status: 404 });

  // Ngoài phạm vi thấy ⇒ 403 — id đoán mò không tải được file việc của người khác.
  if (!(await hasPermission("tasks.view_all"))) {
    const visible = await prisma.task.count({ where: { id: file.taskId, ...taskVisibleWhere(meId) } });
    if (visible === 0) return new NextResponse(null, { status: 403 });
  }

  let buffer: Buffer;
  try {
    buffer = await readTaskFile(file.fileKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": file.fileMime,
      "Content-Disposition": contentDisposition(file.fileName.replace(/["\\]/g, "_")),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
