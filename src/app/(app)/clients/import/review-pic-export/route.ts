import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffId } from "@/lib/current-staff";
import { buildPicReviewWorkbook } from "@/lib/clients-review-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Header HTTP chỉ nhận ByteString — filename có dấu cần encode theo RFC 6266 (xem api/ctv/[id]/route.ts). */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Nhận thẳng file Excel gốc qua form POST (multipart, KHÔNG cần lưu file trước) → trả về file rà
 * soát PIC2/3/4. Form ở import-client-form.tsx submit trực tiếp vào route này (không qua server
 * action) vì cần trả file tải xuống, server action chỉ trả state serializable.
 */
export async function POST(req: NextRequest) {
  const staffId = await getCurrentStaffId();
  if (!staffId) return new NextResponse(null, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "MISSING_FILE" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await buildPicReviewWorkbook(buffer);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition("Ra-soat-PIC2-3-4.xlsx"),
    },
  });
}
