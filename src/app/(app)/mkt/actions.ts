"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { getCurrentStaffId } from "@/lib/current-staff";
import { saveMktFile, deleteMktFile } from "@/lib/mkt-storage";
import {
  MKT_CHANNELS,
  MKT_IMAGE_MIME_TYPES,
  MAX_MKT_IMAGE_BYTES,
  MKT_INSIGHT_MIME_TYPES,
  MAX_MKT_INSIGHT_BYTES,
  MAX_MKT_TITLE,
  MAX_MKT_KEY_POINTS,
  MAX_MKT_CONTENT,
  MAX_MKT_NOTE,
  isMktFileChannel,
  isValidMktUrl,
  isValidQuarter,
  isValidFiscalYear,
} from "@/lib/mkt";

/**
 * `error` là MÃ lỗi (client dịch qua `errXXX`), còn `aiError` là câu ĐÃ DỊCH SẴN từ phía server —
 * lỗi DeepSeek nằm ở namespace `ai.errors` và chỉ server mới biết mã nào. Tách hai trường thay vì
 * dùng chung `error` để không có chỗ nào phải đoán "chuỗi này là mã hay là câu".
 * `message` là thông tin phụ (danh sách tệp bị từ chối), không phải lỗi.
 */
export type MktState = { error?: string; aiError?: string; success?: boolean; message?: string; postId?: string };

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

function revalidate(postId?: string) {
  revalidatePath("/mkt");
  revalidatePath("/mkt/insights");
  if (postId) revalidatePath(`/mkt/${postId}`);
}

async function audit(entityId: string, action: string, payload: unknown) {
  await prisma.auditLog.create({
    data: {
      entityType: "mkt",
      entityId,
      field: "*",
      newValue: JSON.stringify(payload),
      action,
      changedBy: await getCurrentStaffId(),
    },
  });
}

/**
 * Lưu tệp đính kèm từ FormData — dùng chung cho ảnh bài và file insights.
 *
 * KHÔNG throw khi một tệp sai định dạng/quá cỡ: trả tên tệp vào `rejected` để UI báo, phần còn lại
 * vẫn ghi (khuôn `saveProjectFilesFromFormData`). Bài đăng có 5 ảnh mà 1 ảnh quá cỡ thì 4 ảnh kia
 * vẫn phải vào được.
 */
async function saveUploads(
  formData: FormData,
  field: string,
  allowedMimes: readonly string[],
  maxBytes: number,
  write: (fileKey: string, file: File, index: number) => Promise<void>,
): Promise<string[]> {
  const files = formData.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  const rejected: string[] = [];
  let i = 0;
  for (const file of files) {
    if (file.size > maxBytes || !allowedMimes.includes(file.type)) {
      rejected.push(file.name);
      continue;
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileKey = await saveMktFile(buffer, file.type);
      await write(fileKey, file, i);
      i++;
    } catch (e) {
      console.error("[MKT] lỗi lưu tệp đính kèm:", e);
      rejected.push(file.name);
    }
  }
  return rejected;
}

/**
 * Người nhận thông báo theo QUYỀN.
 *
 * ⚠ Phải cộng riêng `role.code === "ADMIN"`: ADMIN là SÀN CỨNG trong code (lib/permissions.ts) và
 * KHÔNG có dòng nào trong bảng `role_permission`, nên truy vấn thuần theo quyền sẽ bỏ sót admin —
 * đúng caveat đã ghi ở `checkExpiryWarnings` (reminders.ts).
 */
async function staffIdsWithPermission(code: string, exceptId: string | null): Promise<string[]> {
  const rows = await prisma.staff.findMany({
    where: {
      isActive: true,
      OR: [{ role: { permissions: { some: { permissionCode: code } } } }, { role: { code: "ADMIN" } }],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id).filter((id) => id !== exceptId);
}

// ─────────────────────────────────────────────────────────
// BÀI ĐĂNG
// ─────────────────────────────────────────────────────────

async function readPostFields(formData: FormData) {
  const title = str(formData.get("title"));
  const keyPoints = str(formData.get("keyPoints"));
  const contentTypeId = nullable(formData.get("contentTypeId"));
  const projectId = nullable(formData.get("projectId"));
  const driveUrl = str(formData.get("driveUrl"));

  if (!title || !keyPoints) return { error: "NEED_FIELDS" as const };
  if (title.length > MAX_MKT_TITLE || keyPoints.length > MAX_MKT_KEY_POINTS) return { error: "TOO_LONG" as const };
  if (!isValidMktUrl(driveUrl)) return { error: "BAD_URL" as const };
  if (!contentTypeId) return { error: "BAD_TYPE" as const };

  // Loại nội dung phải là item ĐANG BẬT của đúng set — id đến từ form nên không tin được.
  const item = await prisma.optionItem.findFirst({
    where: { id: contentTypeId, isActive: true, set: { code: "mkt_content_type" } },
    select: { id: true },
  });
  if (!item) return { error: "BAD_TYPE" as const };

  if (projectId) {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!p) return { error: "NOT_FOUND" as const };
  }
  return { data: { title, keyPoints, contentTypeId, projectId, driveUrl: driveUrl || null } };
}

export async function createPost(_prev: MktState, formData: FormData): Promise<MktState> {
  await requirePermission("mkt.post.manage");
  const parsed = await readPostFields(formData);
  if ("error" in parsed) return { error: parsed.error };

  const channels = MKT_CHANNELS.filter((c) => str(formData.get(`channel_${c}`)) !== "");
  if (channels.length === 0) return { error: "NO_CHANNEL" };

  const staffId = await getCurrentStaffId();
  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.mktPost.create({ data: { ...parsed.data, createdById: staffId } });
    await tx.mktPostVariant.createMany({ data: channels.map((channel) => ({ postId: created.id, channel })) });
    return created;
  });

  // Ảnh ghi NGOÀI transaction: đọc file + ghi đĩa có thể mất vài giây, giữ writer SQLite suốt thời
  // gian đó là chặn cả app (single-writer).
  const rejected = await saveUploads(formData, "images", MKT_IMAGE_MIME_TYPES, MAX_MKT_IMAGE_BYTES, async (fileKey, file, i) => {
    await prisma.mktPostImage.create({
      data: {
        postId: post.id,
        fileKey,
        fileMime: file.type,
        fileName: file.name || "image",
        fileSize: file.size,
        sort: i,
        uploadedById: staffId,
      },
    });
  });

  await audit(post.id, "CREATE", { title: post.title, channels, rejected: rejected.length });

  // Fan-out SAU transaction (quy ước SQLite của repo).
  const reviewers = await staffIdsWithPermission("mkt.review", staffId);
  if (reviewers.length > 0) {
    await prisma.notification.createMany({
      data: reviewers.map((id) => ({
        recipientStaffId: id,
        type: "MKT_POST_SUBMITTED",
        title: `Bài MKT mới chờ viết & duyệt đăng: "${post.title}"`,
        body: `Kênh: ${channels.join(", ")}`,
      })),
    });
  }

  revalidate(post.id);
  return { success: true, postId: post.id, message: rejected.join(" · ") || undefined };
}

export async function updatePost(postId: string, _prev: MktState, formData: FormData): Promise<MktState> {
  await requirePermission("mkt.post.manage");
  const post = await prisma.mktPost.findUnique({
    where: { id: postId },
    select: { id: true, variants: { select: { status: true } } },
  });
  if (!post) return { error: "NOT_FOUND" };
  // Đã đăng rồi thì ý chính là bằng chứng của bài đang nằm ngoài kia — khoá lại.
  if (post.variants.some((v) => v.status === "POSTED")) return { error: "LOCKED" };

  const parsed = await readPostFields(formData);
  if ("error" in parsed) return { error: parsed.error };

  await prisma.mktPost.update({ where: { id: postId }, data: parsed.data });
  await audit(postId, "UPDATE", parsed.data);
  revalidate(postId);
  return { success: true };
}

export async function addImages(postId: string, _prev: MktState, formData: FormData): Promise<MktState> {
  await requirePermission("mkt.post.manage");
  const post = await prisma.mktPost.findUnique({
    where: { id: postId },
    select: { id: true, _count: { select: { images: true } } },
  });
  if (!post) return { error: "NOT_FOUND" };

  const staffId = await getCurrentStaffId();
  const base = post._count.images;
  const rejected = await saveUploads(formData, "images", MKT_IMAGE_MIME_TYPES, MAX_MKT_IMAGE_BYTES, async (fileKey, file, i) => {
    await prisma.mktPostImage.create({
      data: {
        postId,
        fileKey,
        fileMime: file.type,
        fileName: file.name || "image",
        fileSize: file.size,
        sort: base + i,
        uploadedById: staffId,
      },
    });
  });
  await audit(postId, "UPDATE", { addedImages: true, rejected: rejected.length });
  revalidate(postId);
  return { success: true, message: rejected.join(" · ") || undefined };
}

export async function deleteImage(postId: string, imageId: string, _prev: MktState, _formData: FormData): Promise<MktState> {
  await requirePermission("mkt.post.manage");
  // Kiểm ảnh thuộc ĐÚNG bài đang mở — id đến từ form nên đoán id là xoá được ảnh bài khác.
  const image = await prisma.mktPostImage.findFirst({ where: { id: imageId, postId }, select: { id: true, fileKey: true } });
  if (!image) return { error: "NOT_FOUND" };

  await prisma.mktPostImage.delete({ where: { id: image.id } });
  await deleteMktFile(image.fileKey);
  await audit(postId, "UPDATE", { deletedImage: imageId });
  revalidate(postId);
  return { success: true };
}

export async function deletePost(postId: string, _prev: MktState, _formData: FormData): Promise<MktState> {
  await requirePermission("mkt.post.manage");
  const post = await prisma.mktPost.findUnique({
    where: { id: postId },
    select: { id: true, title: true, variants: { select: { status: true } }, images: { select: { fileKey: true } } },
  });
  if (!post) return { error: "NOT_FOUND" };
  if (post.variants.some((v) => v.status === "POSTED")) return { error: "LOCKED" };

  await prisma.mktPost.delete({ where: { id: postId } }); // cascade ảnh + variant
  for (const img of post.images) await deleteMktFile(img.fileKey);
  await audit(postId, "DELETE", { title: post.title });
  revalidate();
  return { success: true };
}

// ─────────────────────────────────────────────────────────
// BẢN CUỐI TỪNG KÊNH
// ─────────────────────────────────────────────────────────

export async function saveFinal(variantId: string, _prev: MktState, formData: FormData): Promise<MktState> {
  await requirePermission("mkt.review");
  const variant = await prisma.mktPostVariant.findUnique({ where: { id: variantId }, select: { postId: true, status: true } });
  if (!variant) return { error: "NOT_FOUND" };
  if (variant.status === "POSTED") return { error: "LOCKED" };

  const finalContent = str(formData.get("finalContent"));
  if (finalContent.length > MAX_MKT_CONTENT) return { error: "TOO_LONG" };

  await prisma.mktPostVariant.update({ where: { id: variantId }, data: { finalContent } });
  await audit(variant.postId, "UPDATE", { variantId, savedFinal: finalContent.length });
  revalidate(variant.postId);
  return { success: true };
}

export async function markPosted(variantId: string, _prev: MktState, formData: FormData): Promise<MktState> {
  await requirePermission("mkt.review");
  const variant = await prisma.mktPostVariant.findUnique({
    where: { id: variantId },
    select: { postId: true, channel: true, finalContent: true, post: { select: { title: true, createdById: true } } },
  });
  if (!variant) return { error: "NOT_FOUND" };
  if (!variant.finalContent.trim()) return { error: "NO_CONTENT" };

  const postUrl = str(formData.get("postUrl"));
  if (!isValidMktUrl(postUrl)) return { error: "BAD_URL" };

  const staffId = await getCurrentStaffId();
  // Guard trạng thái trong `where` + kiểm count: hai tab cùng bấm thì tab sau phải rớt, không phải
  // ghi đè im lặng (khuôn moveBudget của overhead).
  const res = await prisma.mktPostVariant.updateMany({
    where: { id: variantId, status: { in: ["DRAFT", "AI_DRAFTED"] } },
    data: { status: "POSTED", postedAt: new Date(), postUrl: postUrl || null, postedById: staffId },
  });
  if (res.count === 0) return { error: "WRONG_STATE" };

  await audit(variant.postId, "UPDATE", { variantId, channel: variant.channel, status: "POSTED" });

  const author = variant.post.createdById;
  if (author && author !== staffId) {
    await prisma.notification.createMany({
      data: [
        {
          recipientStaffId: author,
          type: "MKT_POST_PUBLISHED",
          title: `Bài "${variant.post.title}" đã đăng ${variant.channel === "LINKEDIN" ? "LinkedIn" : "Fanpage"}`,
          body: postUrl || null,
        },
      ],
    });
  }
  revalidate(variant.postId);
  return { success: true };
}

export async function unmarkPosted(variantId: string, _prev: MktState, _formData: FormData): Promise<MktState> {
  await requirePermission("mkt.review");
  const variant = await prisma.mktPostVariant.findUnique({ where: { id: variantId }, select: { postId: true, aiDraft: true } });
  if (!variant) return { error: "NOT_FOUND" };

  // Về lại đúng trạng thái trước đó: có bản AI thì AI_DRAFTED, chưa có thì DRAFT.
  // finalContent GIỮ NGUYÊN — người dùng bỏ đánh dấu để sửa, không phải để mất bài.
  const res = await prisma.mktPostVariant.updateMany({
    where: { id: variantId, status: "POSTED" },
    data: { status: variant.aiDraft ? "AI_DRAFTED" : "DRAFT", postedAt: null, postUrl: null, postedById: null },
  });
  if (res.count === 0) return { error: "WRONG_STATE" };

  await audit(variant.postId, "UPDATE", { variantId, status: "UNPOSTED" });
  revalidate(variant.postId);
  return { success: true };
}

// ─────────────────────────────────────────────────────────
// LINK THƯ MỤC FRAME
// ─────────────────────────────────────────────────────────

/** Không có helper ghi setting dùng chung trong repo — mỗi module tự giữ bản riêng (khuôn settings/clients). */
async function upsertSetting(key: string, value: string, staffId: string | null) {
  await prisma.setting.upsert({
    where: { module_key_scope_scopeRef: { module: "mkt", key, scope: "GLOBAL", scopeRef: "" } },
    update: { value, updatedBy: staffId },
    create: { module: "mkt", key, value, updatedBy: staffId },
  });
}

export async function saveFrameLinks(_prev: MktState, formData: FormData): Promise<MktState> {
  await requirePermission("mkt.frames.manage");
  const linkedin = str(formData.get("linkedinUrl"));
  const fanpage = str(formData.get("fanpageUrl"));
  if (!isValidMktUrl(linkedin) || !isValidMktUrl(fanpage)) return { error: "BAD_URL" };

  const staffId = await getCurrentStaffId();
  await upsertSetting("frames_linkedin_url", linkedin, staffId);
  await upsertSetting("frames_fanpage_url", fanpage, staffId);
  await audit("frames", "UPDATE", { linkedin, fanpage });
  revalidatePath("/mkt");
  return { success: true };
}

// ─────────────────────────────────────────────────────────
// BÁO CÁO INSIGHTS QUÝ
// ─────────────────────────────────────────────────────────

export async function createInsightReport(_prev: MktState, formData: FormData): Promise<MktState> {
  await requirePermission("mkt.review");
  const year = Number(str(formData.get("year")));
  const quarter = Number(str(formData.get("quarter")));
  const note = nullable(formData.get("note"));
  if (!isValidFiscalYear(year)) return { error: "BAD_YEAR" };
  if (!isValidQuarter(quarter)) return { error: "BAD_QUARTER" };
  if (note && note.length > MAX_MKT_NOTE) return { error: "TOO_LONG" };

  const existing = await prisma.mktInsightReport.findUnique({ where: { year_quarter: { year, quarter } }, select: { id: true } });
  if (existing) return { error: "EXISTS" };

  const report = await prisma.mktInsightReport.create({
    data: { year, quarter, note, createdById: await getCurrentStaffId() },
  });
  await audit(report.id, "CREATE", { year, quarter });
  revalidatePath("/mkt/insights");
  return { success: true };
}

export async function updateInsightNote(reportId: string, _prev: MktState, formData: FormData): Promise<MktState> {
  await requirePermission("mkt.review");
  const note = nullable(formData.get("note"));
  if (note && note.length > MAX_MKT_NOTE) return { error: "TOO_LONG" };
  const res = await prisma.mktInsightReport.updateMany({ where: { id: reportId }, data: { note } });
  if (res.count === 0) return { error: "NOT_FOUND" };
  await audit(reportId, "UPDATE", { note: note?.length ?? 0 });
  revalidatePath("/mkt/insights");
  return { success: true };
}

export async function uploadInsightFiles(reportId: string, _prev: MktState, formData: FormData): Promise<MktState> {
  await requirePermission("mkt.review");
  const report = await prisma.mktInsightReport.findUnique({ where: { id: reportId }, select: { id: true } });
  if (!report) return { error: "NOT_FOUND" };

  const channel = str(formData.get("channel"));
  if (!isMktFileChannel(channel)) return { error: "BAD_CHANNEL" };

  const staffId = await getCurrentStaffId();
  const rejected = await saveUploads(formData, "files", MKT_INSIGHT_MIME_TYPES, MAX_MKT_INSIGHT_BYTES, async (fileKey, file) => {
    await prisma.mktInsightFile.create({
      data: {
        reportId,
        channel,
        fileKey,
        fileMime: file.type,
        fileName: file.name || "file",
        fileSize: file.size,
        uploadedById: staffId,
      },
    });
  });
  await audit(reportId, "UPDATE", { uploadedFiles: true, channel, rejected: rejected.length });
  revalidatePath("/mkt/insights");
  return { success: true, message: rejected.join(" · ") || undefined };
}

export async function deleteInsightFile(reportId: string, fileId: string, _prev: MktState, _formData: FormData): Promise<MktState> {
  await requirePermission("mkt.review");
  const file = await prisma.mktInsightFile.findFirst({ where: { id: fileId, reportId }, select: { id: true, fileKey: true } });
  if (!file) return { error: "NOT_FOUND" };

  await prisma.mktInsightFile.delete({ where: { id: file.id } });
  await deleteMktFile(file.fileKey);
  await audit(reportId, "UPDATE", { deletedFile: fileId });
  revalidatePath("/mkt/insights");
  return { success: true };
}

export async function deleteInsightReport(reportId: string, _prev: MktState, _formData: FormData): Promise<MktState> {
  await requirePermission("mkt.review");
  const report = await prisma.mktInsightReport.findUnique({
    where: { id: reportId },
    select: { id: true, year: true, quarter: true, files: { select: { fileKey: true } } },
  });
  if (!report) return { error: "NOT_FOUND" };

  await prisma.mktInsightReport.delete({ where: { id: reportId } }); // cascade file
  for (const f of report.files) await deleteMktFile(f.fileKey);
  await audit(reportId, "DELETE", { year: report.year, quarter: report.quarter });
  revalidatePath("/mkt/insights");
  return { success: true };
}

// ─────────────────────────────────────────────────────────
// MKT-2b — ĐĂNG QUA API / HẸN GIỜ
// ─────────────────────────────────────────────────────────

/**
 * Đăng NGAY qua API. Gác `mkt.review` — cùng vai với đánh dấu đã đăng, vì đây vẫn là hành động
 * "duyệt xong và cho lên trang", chỉ khác ở chỗ máy bấm hộ thay vì người copy sang trình duyệt.
 *
 * ⚠ Đăng lên trang CÔNG KHAI là việc không thu hồi tự động được — client BẮT BUỘC hỏi xác nhận
 * trước khi gọi (variant-panel.tsx). Server không hỏi lại được nên guard thật nằm ở publishVariant:
 * chưa nối kênh / token hỏng / đã POSTED đều bị chặn.
 */
export async function publishNow(variantId: string, _prev: MktState, _formData: FormData): Promise<MktState> {
  await requirePermission("mkt.review");
  const { publishVariant } = await import("@/lib/mkt-publish-server");
  const v = await prisma.mktPostVariant.findUnique({ where: { id: variantId }, select: { postId: true } });
  if (!v) return { error: "NOT_FOUND" };
  const r = await publishVariant(variantId, { actorStaffId: await getCurrentStaffId() });
  revalidate(v.postId);
  if (!r.ok) return { error: r.code, message: r.message };
  return { success: true };
}

/** Đặt / gỡ lịch hẹn đăng. Mốc là THỜI ĐIỂM THẬT nên dựng bằng giờ ĐỊA PHƯƠNG, không UTC-midnight. */
export async function scheduleVariant(variantId: string, _prev: MktState, formData: FormData): Promise<MktState> {
  await requirePermission("mkt.review");
  const v = await prisma.mktPostVariant.findUnique({ where: { id: variantId }, select: { postId: true, status: true, finalContent: true } });
  if (!v) return { error: "NOT_FOUND" };
  if (v.status === "POSTED") return { error: "WRONG_STATE" };

  const clear = str(formData.get("clear")) === "1";
  if (clear) {
    await prisma.mktPostVariant.update({ where: { id: variantId }, data: { scheduledAt: null } });
    await audit(v.postId, "UPDATE", { variantId, schedule: null });
    revalidate(v.postId);
    return { success: true };
  }

  if (!v.finalContent.trim()) return { error: "NO_CONTENT" };
  const date = str(formData.get("date"));
  const time = str(formData.get("time")) || "09:00";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const hm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !hm) return { error: "BAD_SCHEDULE" };
  const when = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(hm[1]), Number(hm[2]));
  if (Number.isNaN(when.getTime())) return { error: "BAD_SCHEDULE" };
  // Hẹn vào quá khứ = đăng ở tick kế tiếp. Cho phép nhưng chặn hẹn quá xa (gõ nhầm năm).
  if (when.getTime() > Date.now() + 400 * 86_400_000) return { error: "BAD_SCHEDULE" };

  await prisma.mktPostVariant.update({ where: { id: variantId }, data: { scheduledAt: when, publishError: null } });
  await audit(v.postId, "UPDATE", { variantId, schedule: when.toISOString() });
  revalidate(v.postId);
  return { success: true };
}
