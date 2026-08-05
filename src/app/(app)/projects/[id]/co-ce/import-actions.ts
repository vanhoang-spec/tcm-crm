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
import { loadCurrentCeRows, matchSavedImport, buildSheetPayloadFromDb } from "@/lib/costsheet-import-server";
import { saveCostSheet } from "@/app/(app)/bidding/actions";

/** 12MB — bản nhiều sheet của T013 nặng ~160KB, mức này thừa cho file khách kèm ảnh/ghi chú. */
const MAX_IMPORT_BYTES = 12 * 1024 * 1024;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ImportFormState = {
  /** Mã lỗi (trang dịch sang câu tiếng Việt/Anh) — không trả câu chữ từ server. */
  error?: string;
  /** Câu lỗi ĐÃ DỊCH do saveCostSheet trả về — khác trường error vốn là MÃ để trang tự dịch. */
  errorText?: string;
  /** Khoá file đã lưu — trang đọc lại bằng khoá này để dựng bản nháp. */
  fileKey?: string;
  /** CE-5 — số version vừa sinh; trang dùng để mở sẵn khối so sánh vN↔vN+1. */
  createdRevNo?: number;
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

/**
 * CE-5 — ÁP phản hồi của khách vào bảng và sinh VERSION MỚI.
 *
 * ⚠ Không tự chạy lúc import: Account phải rà bảng đối chiếu rồi bấm nút này (quyết định chủ dự án
 * 05/08 — một file khách gửi nhầm không được phép đẻ version).
 *
 * ⚠ KHÔNG có đường ghi thứ hai: hàm dựng lại payload từ DB, áp thay đổi CE, rồi gọi CHÍNH
 * `saveCostSheet` — nhờ vậy version sinh từ import vẫn đi qua Zod, stock guard K3, server tự tính
 * lại mọi tổng, margin gate, stableKey, snapshot và `syncFinanceCostLines` y như lưu tay.
 */
export async function applyImportToNewVersion(projectId: string, _prev: ImportFormState, formData: FormData): Promise<ImportFormState> {
  await requirePermission("bidding.costsheet.edit");
  const fileKey = String(formData.get("fileKey") ?? "");
  if (!fileKey) return { error: "EMPTY" };

  const base = await loadCurrentCeRows(projectId);
  if (!base) return { error: "NO_SHEET" };
  // Bảng chế độ CŨ: áp CE theo dòng sẽ LẬT bảng sang chế độ mới trong im lặng — chặn, để Account
  // tự bấm "Chuyển sang CE theo dòng" trước nếu thực sự muốn.
  if (!base.lineCeMode) return { error: "LEGACY_MODE" };

  const match = await matchSavedImport(projectId, fileKey);
  if (!match) return { error: "UNREADABLE" };
  if (match.changed.length === 0 && match.missingInFile.length === 0) return { error: "NO_CHANGE" };

  const built = await buildSheetPayloadFromDb(projectId);
  if (!built) return { error: "NO_SHEET" };

  // revNo hiện tại — đọc TRƯỚC khi lưu để tag đúng bản mình vừa tạo, không phải "bản mới nhất"
  // (người khác có thể lưu chen vào giữa lúc commit và lúc tag).
  const prevRev = await prisma.costSheetRevision.findFirst({
    where: { costSheetId: built.sheet.id },
    orderBy: { revNo: "desc" },
    select: { revNo: true },
  });
  const prevRevNo = prevRev?.revNo ?? 0;

  const changeByKey = new Map(match.changed.map((c) => [c.stableKey, c]));
  const droppedKeys = new Set(match.missingInFile.map((m) => m.stableKey));
  const lines = (built.payload.lines as Record<string, unknown>[]).map((l) => {
    const key = String(l.stableKey ?? "");
    // Khách XOÁ dòng khỏi báo giá → gạch ngang, KHÔNG xoá (Account tự quyết sau).
    if (droppedKeys.has(key)) return { ...l, ceDropped: true };
    const c = changeByKey.get(key);
    if (!c) return l;
    return {
      ...l,
      ceDropped: false,
      // Ô khách để trống thì GIỮ giá trị hiện tại — null làm bảng rớt khỏi chế độ CE theo dòng.
      ceQuantity: c.after.qty ?? l.ceQuantity,
      ceUnitPrice: c.after.unitPrice ?? l.ceUnitPrice,
      // Khách đổi tên hạng mục trên báo giá → dùng tên khách, cắt theo trần của validator.
      ceName: c.fileName !== c.name ? c.fileName.slice(0, 300) : l.ceName,
    };
  });

  const fd = new FormData();
  fd.set("sectionsJson", JSON.stringify({ sections: built.payload.sections, lines }));
  fd.set("scenario", built.sheet.scenario);
  fd.set("vatPct", String(built.sheet.vatPct));
  fd.set("agencyFeePct", String(built.sheet.agencyFeePct));
  fd.set("mgmtFeePct", String(built.sheet.mgmtFeePct));
  fd.set("contingencyPct", String(built.sheet.contingencyPct));
  fd.set("discountPct", String(built.sheet.discountPct));
  fd.set("ceTotal", "0"); // chế độ CE theo dòng: server tự suy, input bị bỏ qua
  fd.set("templateId", built.sheet.templateId ?? "");
  // revisionKind/overrideNote để TRỐNG: bản sinh từ import là bản làm việc, và không được chạm vào
  // nhánh override margin (dưới sàn vẫn lưu được, chỉ là không auto-duyệt).
  const res = await saveCostSheet(projectId, {}, fd);
  if (res.error || res.fieldErrors) {
    return { error: "SAVE_FAILED", errorText: res.error ?? Object.values(res.fieldErrors ?? {})[0] };
  }

  // Gắn nguồn gốc vào ĐÍCH DANH bản vừa sinh.
  const created = await prisma.costSheetRevision.findFirst({
    where: { costSheetId: built.sheet.id, revNo: prevRevNo + 1 },
    select: { id: true, origin: true },
  });
  if (created && !created.origin) {
    await prisma.costSheetRevision.update({
      where: { id: created.id },
      data: { origin: "IMPORT", importFileKey: fileKey, note: `Phản hồi khách cho v${prevRevNo}` },
    });
  }

  revalidatePath(`/projects/${projectId}/co-ce`);
  return { fileKey, createdRevNo: prevRevNo + 1 };
}
