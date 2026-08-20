import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffId } from "@/lib/current-staff";
import { parseAiDoc, docFileName } from "@/lib/doc-blocks";
import { buildDocx, DOCX_MIME } from "@/lib/docx-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Xuất tài liệu AI ra file Word.
 *
 * Nhận JSON tài liệu TỪ CHÍNH FORM đang hiển thị (POST field `doc`) chứ không đọc DB: kết quả AI ở
 * `/ai` không được lưu ở đâu cả (mỗi lần bấm là một lượt gọi mới), nên không có id nào để tra. Vì
 * nội dung đi ra đúng bằng nội dung người dùng đang nhìn nên KHÔNG có rủi ro lộ dữ liệu chéo — chỉ
 * cần chặn khách vãng lai.
 *
 * ⚠ Vẫn phải chạy qua `parseAiDoc` chứ không tin payload: người dùng sửa được hidden input, mà
 * `buildDocx` ghép thẳng chuỗi vào XML — payload rác sẽ đẻ ra file Word hỏng, không mở được.
 */
export async function POST(req: NextRequest) {
  const staffId = await getCurrentStaffId();
  if (!staffId) return new NextResponse("Unauthorized", { status: 401 });

  const form = await req.formData();
  const raw = form.get("doc");
  if (typeof raw !== "string" || !raw.trim()) return new NextResponse("Bad request", { status: 400 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  const doc = parseAiDoc(parsed);
  if (!doc) return new NextResponse("Bad request", { status: 400 });

  const note = typeof form.get("note") === "string" ? String(form.get("note")).slice(0, 300) : null;
  const buf = buildDocx(doc, { note });
  const filename = docFileName(doc.title, "docx");
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
