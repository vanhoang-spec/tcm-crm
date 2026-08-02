"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { isIsoDocCode } from "@/lib/iso-catalog";
import { saveProjectFilesFromFormData } from "@/lib/ai/attachments";

export type IsoFormState = { error?: string; success?: boolean };

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/iso`);
  revalidatePath("/iso");
}

async function audit(projectId: string, docCode: string, action: string, detail: string | null) {
  await prisma.auditLog.create({
    data: {
      entityType: "project_iso_doc",
      entityId: `${projectId}:${docCode}`,
      field: docCode,
      newValue: detail,
      action,
      changedBy: await getCurrentStaffId(),
    },
  });
}

/**
 * Đính bằng chứng cho 1 mục hồ sơ ISO — 3 đường vào cùng một chỗ:
 *  - upload file mới (input name="files")
 *  - chọn file đã có sẵn trong thư viện dự án (projectFileId)
 *  - dán link ngoài (linkUrl)
 *
 * ⚠ `docCode` đến TỪ CLIENT nên phải chốt lại bằng `isIsoDocCode()`. Không kiểm thì gõ tay một mã
 * lạ là đẻ ra dòng hồ sơ không có trong danh mục — nó sẽ không bao giờ hiện trên bảng (bảng render
 * theo ISO_DOCS) mà vẫn nằm trong DB, tức dữ liệu rác không ai thấy để dọn.
 */
export async function attachIsoDoc(projectId: string, docCode: string, _prev: IsoFormState, formData: FormData): Promise<IsoFormState> {
  await requirePermission("iso.manage");
  if (!isIsoDocCode(docCode)) return { error: "INVALID_DOC" };

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { error: "NOT_FOUND" };

  const linkUrl = nullable(formData.get("linkUrl"));
  const note = nullable(formData.get("note"));
  let projectFileId = nullable(formData.get("projectFileId"));

  // File mới upload — dùng lại đúng helper của module AI, không đẻ đường lưu file thứ hai.
  const { savedCount, rejected } = await saveProjectFilesFromFormData(projectId, formData, await getCurrentStaffId());
  if (savedCount > 0) {
    const newest = await prisma.projectFile.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (newest) projectFileId = newest.id;
  } else if (rejected.length > 0 && !linkUrl && !projectFileId) {
    return { error: "FILE_REJECTED" };
  }

  if (!linkUrl && !projectFileId) return { error: "NEED_EVIDENCE" };

  await prisma.projectIsoDoc.upsert({
    where: { projectId_docCode: { projectId, docCode } },
    create: { projectId, docCode, status: "PRESENT", linkUrl, projectFileId, note, updatedById: await getCurrentStaffId() },
    // Đính bằng chứng mới thì xoá luôn lý do "không áp dụng" cũ — để lại là bảng vừa báo CÓ vừa
    // kèm câu giải thích vì sao KHÔNG có, kiểm toán đọc ra hai nghĩa.
    update: { status: "PRESENT", linkUrl, projectFileId, note, naReason: null, updatedById: await getCurrentStaffId() },
  });
  await audit(projectId, docCode, "UPDATE", linkUrl ?? projectFileId);
  revalidate(projectId);
  return { success: true };
}

/** Đánh "không áp dụng" — BẮT BUỘC lý do, vì đó chính là cột giải trình ISO đòi. */
export async function markIsoDocNotApplicable(projectId: string, docCode: string, _prev: IsoFormState, formData: FormData): Promise<IsoFormState> {
  await requirePermission("iso.manage");
  if (!isIsoDocCode(docCode)) return { error: "INVALID_DOC" };

  const naReason = str(formData.get("naReason"));
  if (!naReason) return { error: "NEED_REASON" };

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { error: "NOT_FOUND" };

  const staffId = await getCurrentStaffId();
  await prisma.projectIsoDoc.upsert({
    where: { projectId_docCode: { projectId, docCode } },
    create: { projectId, docCode, status: "NA", naReason, updatedById: staffId },
    update: { status: "NA", naReason, linkUrl: null, projectFileId: null, updatedById: staffId },
  });
  await audit(projectId, docCode, "UPDATE", `NA: ${naReason}`);
  revalidate(projectId);
  return { success: true };
}

/**
 * Gỡ phần đánh dấu tay của 1 mục — về lại trạng thái app tự chấm.
 * KHÔNG xoá `ProjectFile`: file vẫn nằm trong thư viện dự án, chỉ bỏ liên kết với mục ISO này.
 */
export async function clearIsoDoc(projectId: string, docCode: string): Promise<void> {
  await requirePermission("iso.manage");
  if (!isIsoDocCode(docCode)) return;
  await prisma.projectIsoDoc.deleteMany({ where: { projectId, docCode } });
  await audit(projectId, docCode, "DELETE", null);
  revalidate(projectId);
}

/** Link thư mục hồ sơ dự án — cột "Link Hồ sơ" của sheet ISO. */
export async function saveIsoFolderUrl(projectId: string, _prev: IsoFormState, formData: FormData): Promise<IsoFormState> {
  await requirePermission("iso.manage");
  const isoFolderUrl = nullable(formData.get("isoFolderUrl"));
  const before = await prisma.project.findUnique({ where: { id: projectId }, select: { isoFolderUrl: true } });
  if (!before) return { error: "NOT_FOUND" };

  await prisma.project.update({ where: { id: projectId }, data: { isoFolderUrl } });
  await prisma.auditLog.create({
    data: {
      entityType: "project",
      entityId: projectId,
      field: "isoFolderUrl",
      oldValue: before.isoFolderUrl,
      newValue: isoFolderUrl,
      action: "UPDATE",
      changedBy: await getCurrentStaffId(),
    },
  });
  revalidate(projectId);
  return { success: true };
}
