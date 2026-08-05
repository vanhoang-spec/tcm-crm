"use server";

// CE-4 — nhận file báo giá KHÁCH TRẢ VỀ.
//
// ⚠ Action này KHÔNG BAO GIỜ ghi vào bảng CO/CE. Nó chỉ kiểm tra đọc được, lưu file gốc và trả về
// khoá file; trang dùng khoá đó dựng BẢN NHÁP cho Account rà. Muốn thành số thật thì Account bấm
// Lưu ở builder như mọi lần — đi qua đúng `saveCostSheet` với đủ margin gate, validator, revision.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { saveAiFile } from "@/lib/ai-file-storage";
import { parseClientQuotationFile } from "@/lib/costsheet-import";
import { loadCurrentCeRows } from "@/lib/costsheet-import-server";

/** 12MB — bản nhiều sheet của T013 nặng ~160KB, mức này thừa cho file khách kèm ảnh/ghi chú. */
const MAX_IMPORT_BYTES = 12 * 1024 * 1024;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ImportFormState = {
  /** Mã lỗi (trang dịch sang câu tiếng Việt/Anh) — không trả câu chữ từ server. */
  error?: string;
  /** Khoá file đã lưu — trang đọc lại bằng khoá này để dựng bản nháp. */
  fileKey?: string;
};

export async function importClientQuotation(projectId: string, _prev: ImportFormState, formData: FormData): Promise<ImportFormState> {
  // Import là thao tác SỬA bảng CO/CE (kết quả chảy thẳng vào builder) — dùng đúng mã quyền của
  // builder, không đẻ mã quyền mới.
  await requirePermission("bidding.costsheet.edit");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "EMPTY" };
  if (file.size > MAX_IMPORT_BYTES) return { error: "TOO_LARGE" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const base = await loadCurrentCeRows(projectId);
  if (!base) return { error: "NO_SHEET" };

  let lineCount = 0;
  try {
    lineCount = (await parseClientQuotationFile(buffer)).lines.length;
  } catch {
    return { error: "UNREADABLE" };
  }
  if (lineCount === 0) return { error: "NO_LINES" };

  // Lưu file GỐC để về sau còn đối chiếu "khách đã gửi đúng cái gì" — cùng kho với file AI.
  const fileKey = await saveAiFile(buffer, XLSX_MIME);
  revalidatePath(`/projects/${projectId}/co-ce`);
  return { fileKey };
}

/** Ghi nhận nguồn gốc sau khi Account đã rà và bấm Lưu — gắn vào revision mới nhất. */
export async function tagRevisionAsImport(projectId: string, fileKey: string) {
  await requirePermission("bidding.costsheet.edit");
  const rev = await prisma.costSheetRevision.findFirst({
    where: { costSheet: { projectId, version: "CTRACT" } },
    orderBy: { revNo: "desc" },
    select: { id: true, origin: true },
  });
  if (!rev || rev.origin) return;
  await prisma.costSheetRevision.update({ where: { id: rev.id }, data: { origin: "IMPORT", importFileKey: fileKey } });
  revalidatePath(`/projects/${projectId}/co-ce`);
}
