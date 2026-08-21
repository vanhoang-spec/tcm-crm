import { prisma } from "@/lib/prisma";
import { getStringSetting } from "@/lib/settings";
import { AiError } from "@/lib/ai/deepseek";
import { aiDesignBrief, aiDraftVariant, isAiConfigured } from "@/lib/mkt-ai-server";
import { parseChannelsCsv, planDueCutoff, type MktChannel } from "@/lib/mkt";
import { formatDate } from "@/lib/utils";

/**
 * MKT-2a — JOB TỰ DỰNG BÀI TỪ MASTER PLAN.
 *
 * Chạy trong bộ hẹn giờ 5 phút (job-runner). Dòng kế hoạch PLANNED có weekStart ≤ hôm nay + lead
 * (3 ngày) thì: dựng MktPost + variant theo kênh → đánh dấu DRAFTED → báo HR → rồi AI viết nháp
 * từng kênh + soạn brief designer → báo HR "chờ duyệt" + báo designer "có brief".
 *
 * ⚠ BẤT BIẾN QUAN TRỌNG NHẤT: phần AI là FIRE-AND-FORGET (không await). `runDueJobs` được layout
 * AWAIT khi render trang (lưới an toàn — HANDOVER 10.10); một lượt AI tới 75s × 2 kênh nằm trong
 * job là trang của người dùng treo hơn 2 phút. Job này phải trả về trong vài chục ms: chỉ ghi DB +
 * bắn notification, rồi thả promise AI chạy nền trên tiến trình pm2. Tiến trình restart giữa chừng
 * thì bài nằm ở DRAFT không có nháp — HR bấm nút AI tay là xong, không mất gì.
 *
 * ⚠ Chống dựng trùng: claim bằng `updateMany` có `status: "PLANNED"` trong where, count === 0 là
 * lượt khác (tick trước / instance khác) đã lấy — bỏ qua. Cùng khuôn moveBudget (overhead).
 */

/** Người đang hoạt động có quyền `code` — hoặc ADMIN (sàn cứng trong code, không có dòng grant). */
export async function staffIdsWithPermission(code: string): Promise<string[]> {
  const rows = await prisma.staff.findMany({
    where: { isActive: true, OR: [{ role: { permissions: { some: { permissionCode: code } } } }, { role: { code: "ADMIN" } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Designer nhận brief — setting `mkt.designer_staff_ids` (JSON mảng id), chỉ lấy người còn hoạt động. */
export async function designerStaffIds(): Promise<string[]> {
  const raw = await getStringSetting("mkt", "designer_staff_ids", "[]");
  let ids: string[] = [];
  try {
    const v = JSON.parse(raw);
    ids = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    ids = [];
  }
  if (ids.length === 0) return [];
  // Con trỏ tới người đã nghỉ thì bỏ — bài học trưởng team Creative đã nghỉ (HANDOVER 10.32 CR-1c).
  const rows = await prisma.staff.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function notify(staffIds: string[], type: string, title: string, body: string): Promise<void> {
  if (staffIds.length === 0) return;
  await prisma.notification.createMany({ data: staffIds.map((recipientStaffId) => ({ recipientStaffId, type, title, body })) });
}

async function audit(entityId: string, action: string, payload: unknown): Promise<void> {
  await prisma.auditLog.create({
    data: { entityType: "mkt", entityId, field: "*", newValue: JSON.stringify(payload), action, changedBy: null, reason: "tự động từ master plan" },
  });
}

/** Phần CHẬM chạy nền: AI viết từng kênh → brief → thông báo. Nuốt mọi lỗi, chỉ ghi log. */
async function finishAutoDraft(postId: string, title: string, channels: MktChannel[]): Promise<void> {
  const written: string[] = [];
  const failed: string[] = [];
  for (const ch of channels) {
    try {
      const r = await aiDraftVariant(postId, ch);
      (r.ok ? written : failed).push(ch);
      if (!r.ok) console.error(`[mkt-plan] AI viết ${ch} cho ${postId} không được: ${r.code}`);
    } catch (e) {
      failed.push(ch);
      console.error(`[mkt-plan] AI viết ${ch} cho ${postId} lỗi:`, e instanceof AiError ? `${e.code} ${e.detail ?? ""}` : e);
    }
  }

  let brief: string | null = null;
  if (written.length > 0) {
    try {
      const b = await aiDesignBrief(postId);
      if (b.ok && b.brief) brief = b.brief;
      else console.error(`[mkt-plan] brief cho ${postId} không được: ${b.ok ? "?" : b.code}`);
    } catch (e) {
      console.error(`[mkt-plan] brief cho ${postId} lỗi:`, e instanceof AiError ? `${e.code} ${e.detail ?? ""}` : e);
    }
  }

  const reviewers = await staffIdsWithPermission("mkt.review");
  if (written.length > 0) {
    await notify(
      reviewers,
      "MKT_AUTO_DRAFT_READY",
      `AI đã viết xong bài "${title}" — chờ duyệt`,
      `Kênh đã có nháp: ${written.join(", ")}${failed.length ? ` · AI KHÔNG viết được: ${failed.join(", ")} (bấm AI tay hoặc tự viết)` : ""}. Mở mục Bài đăng MKT để sửa và đánh dấu đã đăng.`,
    );
  } else {
    await notify(reviewers, "MKT_AUTO_DRAFT_FAILED", `AI không viết được bài "${title}"`, `Bài đã dựng sẵn từ kế hoạch, cần bấm AI tay hoặc tự viết ở mục Bài đăng MKT.`);
  }
  if (brief) {
    const designers = await designerStaffIds();
    await notify(designers, "MKT_DESIGN_BRIEF", `Brief thiết kế: "${title}"`, `${brief.slice(0, 400)}${brief.length > 400 ? "…" : ""}\n\nXem đầy đủ trong bài ở mục Bài đăng MKT.`);
  }
  await audit(postId, "AUTO_DRAFT_AI", { written, failed, brief: !!brief });
}

type PlanItemRow = {
  id: string;
  weekStart: Date;
  title: string;
  keyPoints: string;
  channels: string;
  contentTypeId: string | null;
  projectId: string | null;
  createdById: string | null;
};

/**
 * Dựng bài cho MỘT dòng kế hoạch (job tự động lẫn nút "Dựng bài ngay" của HR đều đi đường này).
 * Trả về id bài, hoặc null nếu dòng không còn PLANNED (lượt khác đã dựng) / không có kênh.
 */
export async function draftPlanItem(item: PlanItemRow, opts?: { reviewerIds?: string[] }): Promise<string | null> {
  const channels = parseChannelsCsv(item.channels);
  if (channels.length === 0) return null;
  const aiOn = isAiConfigured();
  const now = new Date();

  const post = await prisma.$transaction(async (tx) => {
    const claim = await tx.mktPlanItem.updateMany({ where: { id: item.id, status: "PLANNED" }, data: { status: "DRAFTED", draftedAt: now } });
    if (claim.count === 0) return null;
    const created = await tx.mktPost.create({
      data: { title: item.title, keyPoints: item.keyPoints, contentTypeId: item.contentTypeId, projectId: item.projectId, createdById: item.createdById },
    });
    await tx.mktPostVariant.createMany({ data: channels.map((channel) => ({ postId: created.id, channel })) });
    await tx.mktPlanItem.update({ where: { id: item.id }, data: { postId: created.id } });
    return created;
  });
  if (!post) return null;

  const reviewers = opts?.reviewerIds ?? (await staffIdsWithPermission("mkt.review"));
  await audit(post.id, "AUTO_DRAFT", { planItemId: item.id, weekStart: item.weekStart, channels });
  await notify(
    reviewers,
    "MKT_AUTO_DRAFTED",
    `Bài tuần ${formatDate(item.weekStart)} đã dựng từ kế hoạch: "${item.title}"`,
    aiOn ? `Kênh: ${channels.join(", ")}. AI đang viết nháp — sẽ báo lại khi xong.` : `Kênh: ${channels.join(", ")}. AI chưa cấu hình — cần viết tay ở mục Bài đăng MKT.`,
  );

  // Fan-out SAU transaction; phần AI KHÔNG await (xem ghi chú đầu file).
  if (aiOn) void finishAutoDraft(post.id, item.title, channels).catch((e) => console.error("[mkt-plan] finishAutoDraft:", e));
  return post.id;
}

/** Job: dựng bài cho mọi dòng kế hoạch đã tới hạn. Trả về nhanh — phần AI thả chạy nền. */
export async function runMktPlanAutoDraft(): Promise<{ drafted: number }> {
  const due = await prisma.mktPlanItem.findMany({
    where: { status: "PLANNED", weekStart: { lte: planDueCutoff() } },
    orderBy: { weekStart: "asc" },
    select: { id: true, weekStart: true, title: true, keyPoints: true, channels: true, contentTypeId: true, projectId: true, createdById: true },
  });
  if (due.length === 0) return { drafted: 0 };
  const reviewerIds = await staffIdsWithPermission("mkt.review");
  let drafted = 0;
  for (const item of due) if (await draftPlanItem(item, { reviewerIds })) drafted++;
  return { drafted };
}
