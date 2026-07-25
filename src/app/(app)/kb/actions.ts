"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { stringifyAudit } from "@/lib/utils";
import { saveKbFile, deleteKbFile, KB_MIME_TYPES, MAX_KB_FILE_BYTES } from "@/lib/kb-storage";
import { kbDocumentSchema } from "@/lib/validators/kb";

export type KbActionState = { error?: string; success?: boolean };

async function audit(entityType: string, entityId: string, action: string, payload: unknown) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType, entityId, field: "*", newValue: stringifyAudit(payload), action, changedBy: staffId },
  });
}

/**
 * Tạo 1 tài liệu KB — đúng 1 trong 2 nguồn: file upload HOẶC link ngoài (validate ở đây vì
 * File không đi qua zod cùng payload JSON như các form khác trong app).
 */
export async function createKbDocument(_prevState: KbActionState, formData: FormData): Promise<KbActionState> {
  const t = await getTranslations("kb.form");

  const parsed = kbDocumentSchema.safeParse({
    categoryId: String(formData.get("categoryId") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    linkUrl: String(formData.get("linkUrl") ?? ""),
  });
  if (!parsed.success) return { error: t("errorRequired") };
  const { categoryId, title, description, linkUrl } = parsed.data;

  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  const hasLink = linkUrl.trim() !== "";
  if (!hasFile && !hasLink) return { error: t("errorSourceRequired") };
  if (hasFile && hasLink) return { error: t("errorSourceBoth") };

  const category = await prisma.optionItem.findUnique({ where: { id: categoryId } });
  if (!category) return { error: t("errorRequired") };

  let fileKey: string | null = null;
  let fileMime: string | null = null;
  let fileName: string | null = null;
  let fileSize: number | null = null;

  if (hasFile) {
    const f = file as File;
    if (!KB_MIME_TYPES.includes(f.type)) return { error: t("errorFileType") };
    if (f.size > MAX_KB_FILE_BYTES) return { error: t("errorFileSize") };
    const buffer = Buffer.from(await f.arrayBuffer());
    fileKey = await saveKbFile(buffer, f.type);
    fileMime = f.type;
    fileName = f.name;
    fileSize = f.size;
  }

  const staffId = await getCurrentStaffId();
  const count = await prisma.kbDocument.count({ where: { categoryId } });
  const doc = await prisma.kbDocument.create({
    data: {
      categoryId,
      title,
      description: description || null,
      fileKey,
      fileMime,
      fileName,
      fileSize,
      linkUrl: hasLink ? linkUrl : null,
      sort: count,
      uploadedById: staffId,
    },
  });

  await audit("kb_document", doc.id, "CREATE", { categoryId, title, hasFile, hasLink });
  revalidatePath("/kb");
  return { success: true };
}

export async function deleteKbDocument(docId: string): Promise<KbActionState> {
  const doc = await prisma.kbDocument.findUnique({ where: { id: docId } });
  if (!doc) return { error: "NOT_FOUND" };

  if (doc.fileKey) await deleteKbFile(doc.fileKey);
  await prisma.kbDocument.delete({ where: { id: docId } });
  await audit("kb_document", docId, "DELETE", { title: doc.title });
  revalidatePath("/kb");
  return { success: true };
}
