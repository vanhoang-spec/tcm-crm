"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import {
  MAX_GENERAL_NOTE,
  MAX_KB_FILE_NAME,
  MAX_KB_NAME,
  MAX_KB_NOTE,
  isKbSourceKind,
  lessonBlocksSchema,
  parseLessonBlocks,
} from "@/lib/client-kb";
import { getOrCreateKbSpace, loadKbClient, loadKbLesson, lessonBelongsToAnchor } from "@/lib/client-kb-data";
import {
  CLIENT_KB_MIME_TYPES,
  MAX_CLIENT_KB_FILE_BYTES,
  deleteClientKbFile,
  saveClientKbFile,
} from "@/lib/client-kb-storage";

export type KbFormState = { error?: string; success?: boolean };

async function audit(entityType: string, entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType, entityId, field: "*", action, changedBy: staffId, reason } });
}

function revalidate(clientId: string) {
  revalidatePath(`/clients/${clientId}/kb`);
}

/**
 * Mọi action ghi đều đi qua đây: nạp khách → suy ra đối tượng neo (nhóm hoặc khách) → lấy/tạo
 * space. Nhờ vậy sửa KB từ trang của BẤT KỲ pháp nhân nào trong nhóm đều ghi vào cùng một kho.
 */
async function resolveSpace(clientId: string) {
  const loaded = await loadKbClient(clientId);
  if (!loaded) return null;
  const spaceId = await getOrCreateKbSpace(loaded.anchor);
  return { ...loaded, spaceId };
}

/** Bài/topic phải thuộc đúng đối tượng đang mở — chống sửa chéo bằng cách đoán id. */
async function assertTopicInAnchor(topicId: string, clientId: string) {
  const loaded = await loadKbClient(clientId);
  if (!loaded) return null;
  const topic = await prisma.clientKbTopic.findUnique({
    where: { id: topicId },
    select: { id: true, spaceId: true, space: { select: { clientId: true, groupId: true } } },
  });
  if (!topic) return null;
  const s = topic.space;
  const ok = loaded.anchor.kind === "GROUP" ? s.groupId === loaded.anchor.id : s.clientId === loaded.anchor.id;
  return ok ? { topic, loaded } : null;
}

// ── Thông tin chung ───────────────────────────────────────

export async function saveGeneralNote(clientId: string, _prev: KbFormState, formData: FormData): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  const ctx = await resolveSpace(clientId);
  if (!ctx) return { error: t("errorNotFound") };
  const note = String(formData.get("generalNote") ?? "").trim() || null;
  if (note && note.length > MAX_GENERAL_NOTE) return { error: t("errorTooLong") };
  await prisma.clientKbSpace.update({ where: { id: ctx.spaceId }, data: { generalNote: note } });
  await audit("client_kb_space", ctx.spaceId, "UPDATE", "general note");
  revalidate(clientId);
  return { success: true };
}

// ── Topic ─────────────────────────────────────────────────

export async function createTopic(clientId: string, _prev: KbFormState, formData: FormData): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  const ctx = await resolveSpace(clientId);
  if (!ctx) return { error: t("errorNotFound") };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > MAX_KB_NAME) return { error: t("errorTopicName") };
  const last = await prisma.clientKbTopic.findFirst({
    where: { spaceId: ctx.spaceId },
    orderBy: { sort: "desc" },
    select: { sort: true },
  });
  const topic = await prisma.clientKbTopic.create({
    data: { spaceId: ctx.spaceId, name, sort: (last?.sort ?? -1) + 1 },
  });
  await audit("client_kb_topic", topic.id, "CREATE");
  revalidate(clientId);
  return { success: true };
}

export async function renameTopic(clientId: string, topicId: string, _prev: KbFormState, formData: FormData): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  const found = await assertTopicInAnchor(topicId, clientId);
  if (!found) return { error: t("errorNotFound") };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > MAX_KB_NAME) return { error: t("errorTopicName") };
  await prisma.clientKbTopic.update({ where: { id: topicId }, data: { name } });
  await audit("client_kb_topic", topicId, "UPDATE");
  revalidate(clientId);
  return { success: true };
}

/** Xoá chủ đề — chỉ khi CHƯA có bài nào, để không âm thầm cuốn theo nội dung người khác soạn. */
export async function deleteTopic(clientId: string, topicId: string, _prev: KbFormState, _formData: FormData): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  const found = await assertTopicInAnchor(topicId, clientId);
  if (!found) return { error: t("errorNotFound") };
  const lessons = await prisma.clientKbLesson.count({ where: { topicId } });
  if (lessons > 0) return { error: t("errorTopicHasLessons", { count: lessons }) };
  await prisma.clientKbTopic.delete({ where: { id: topicId } });
  await audit("client_kb_topic", topicId, "DELETE");
  revalidate(clientId);
  return { success: true };
}

// ── Bài học ───────────────────────────────────────────────

export async function createLesson(clientId: string, topicId: string, _prev: KbFormState, formData: FormData): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  const found = await assertTopicInAnchor(topicId, clientId);
  if (!found) return { error: t("errorNotFound") };
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2 || title.length > MAX_KB_NAME) return { error: t("errorLessonTitle") };
  const last = await prisma.clientKbLesson.findFirst({
    where: { topicId },
    orderBy: { sort: "desc" },
    select: { sort: true },
  });
  const staffId = await getCurrentStaffId();
  const lesson = await prisma.clientKbLesson.create({
    data: { topicId, title, sort: (last?.sort ?? -1) + 1, updatedById: staffId },
  });
  await audit("client_kb_lesson", lesson.id, "CREATE");
  revalidate(clientId);
  return { success: true };
}

/**
 * Lưu nội dung bài. `blocksJson` do client dựng — server LUÔN validate lại bằng Zod trước khi ghi
 * (không tin dữ liệu từ client, và đây là hàng rào chống nội dung lạ lọt vào trang đọc).
 */
export async function updateLesson(clientId: string, lessonId: string, _prev: KbFormState, formData: FormData): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  const loaded = await loadKbClient(clientId);
  const lesson = await loadKbLesson(lessonId);
  if (!loaded || !lesson || !lessonBelongsToAnchor(lesson, loaded.anchor)) return { error: t("errorNotFound") };

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2 || title.length > MAX_KB_NAME) return { error: t("errorLessonTitle") };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("blocksJson") ?? "[]"));
  } catch {
    return { error: t("errorBlocks") };
  }
  const parsed = lessonBlocksSchema.safeParse(raw);
  if (!parsed.success) return { error: t("errorBlocks") };

  const staffId = await getCurrentStaffId();
  await prisma.clientKbLesson.update({
    where: { id: lessonId },
    data: { title, blocksJson: JSON.stringify(parsed.data), updatedById: staffId },
  });
  await audit("client_kb_lesson", lessonId, "UPDATE");
  revalidate(clientId);
  revalidatePath(`/clients/${clientId}/kb/lesson/${lessonId}`);
  return { success: true };
}

/** Đăng / gỡ đăng. Người chỉ có quyền xem không bao giờ thấy bản nháp (lọc ở tầng truy vấn). */
export async function setLessonStatus(clientId: string, lessonId: string, publish: boolean, _prev: KbFormState, _formData: FormData): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  const loaded = await loadKbClient(clientId);
  const lesson = await loadKbLesson(lessonId);
  if (!loaded || !lesson || !lessonBelongsToAnchor(lesson, loaded.anchor)) return { error: t("errorNotFound") };
  // Bài mới tạo là bài RỖNG và nút duy nhất trên danh sách là "Đăng" — không chặn ở đây thì PIC
  // dựng dàn bài xong bấm đăng cả loạt, nhân viên mở ra chỉ đọc được "Bài này chưa có nội dung".
  if (publish && parseLessonBlocks(lesson.blocksJson).length === 0) return { error: t("errorPublishEmpty") };
  await prisma.clientKbLesson.update({ where: { id: lessonId }, data: { status: publish ? "PUBLISHED" : "DRAFT" } });
  await audit("client_kb_lesson", lessonId, "UPDATE", publish ? "publish" : "unpublish");
  revalidate(clientId);
  revalidatePath(`/clients/${clientId}/kb/lesson/${lessonId}`);
  return { success: true };
}

export async function deleteLesson(clientId: string, lessonId: string, _prev: KbFormState, _formData: FormData): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  const loaded = await loadKbClient(clientId);
  const lesson = await loadKbLesson(lessonId);
  if (!loaded || !lesson || !lessonBelongsToAnchor(lesson, loaded.anchor)) return { error: t("errorNotFound") };
  await prisma.clientKbLesson.delete({ where: { id: lessonId } });
  await audit("client_kb_lesson", lessonId, "DELETE");
  revalidate(clientId);
  // Người bấm xoá đang đứng ở trang sửa của chính bài vừa mất — phải đưa về trang KB.
  redirect(`/clients/${clientId}/kb`);
}

// ── Tài liệu nguồn ────────────────────────────────────────

export async function uploadSource(clientId: string, _prev: KbFormState, formData: FormData): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  const ctx = await resolveSpace(clientId);
  if (!ctx) return { error: t("errorNotFound") };

  const kind = String(formData.get("kind") ?? "");
  if (!isKbSourceKind(kind)) return { error: t("errorSourceKind") };
  const note = String(formData.get("note") ?? "").trim() || null;
  if (note && note.length > MAX_KB_NOTE) return { error: t("errorTooLong") };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: t("errorNoFile") };
  if (file.size > MAX_CLIENT_KB_FILE_BYTES) return { error: t("errorFileTooBig") };
  if (!CLIENT_KB_MIME_TYPES.includes(file.type)) return { error: t("errorFileType") };

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileKey = await saveClientKbFile(buffer, file.type);
  const staffId = await getCurrentStaffId();
  const created = await prisma.clientKbSource.create({
    data: {
      spaceId: ctx.spaceId,
      kind,
      fileKey,
      fileMime: file.type,
      fileName: file.name.slice(0, MAX_KB_FILE_NAME), // tên dài bất thường làm vỡ header Content-Disposition lúc tải về
      fileSize: file.size,
      note,
      uploadedById: staffId,
    },
  });
  await audit("client_kb_source", created.id, "CREATE");
  revalidate(clientId);
  return { success: true };
}

export async function deleteSource(clientId: string, sourceId: string, _prev: KbFormState, _formData: FormData): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  const loaded = await loadKbClient(clientId);
  const src = await prisma.clientKbSource.findUnique({
    where: { id: sourceId },
    select: { fileKey: true, space: { select: { clientId: true, groupId: true } } },
  });
  if (!loaded || !src) return { error: t("errorNotFound") };
  const ok = loaded.anchor.kind === "GROUP" ? src.space.groupId === loaded.anchor.id : src.space.clientId === loaded.anchor.id;
  if (!ok) return { error: t("errorNotFound") };

  await prisma.clientKbSource.delete({ where: { id: sourceId } });
  await deleteClientKbFile(src.fileKey); // xoá file SAU khi bản ghi đã đi, tránh mất file mà dòng còn
  await audit("client_kb_source", sourceId, "DELETE");
  revalidate(clientId);
  return { success: true };
}
