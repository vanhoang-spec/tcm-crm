"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { draftPlanItem } from "@/lib/mkt-plan-server";
import {
  MAX_MKT_KEY_POINTS,
  MAX_MKT_NOTE,
  MAX_MKT_TITLE,
  MKT_CHANNELS,
  channelsToCsv,
  parseWeekKey,
  weekKey,
} from "@/lib/mkt";

/**
 * MKT-2a — MASTER PLAN nội dung.
 *
 * Mọi đường GHI gác `mkt.review` (HR là người cầm kế hoạch đăng bài — cùng vai với duyệt/đăng).
 * AI đề xuất kế hoạch kiểm thêm `mkt.generate` BÊN TRONG (đặc quyền tính tiền theo lượt, mirror
 * generateVariant). Trang xem gác `mkt.view`.
 *
 * ⚠ AI đề xuất chỉ TRẢ VỀ FORM cho HR duyệt/sửa — KHÔNG ghi thẳng (mirror parseCvWithAi). Ghi là
 * bước `savePlanItems` riêng, sau khi HR bấm "Lưu vào kế hoạch".
 * ⚠ Dòng đã DRAFTED không sửa/xoá được ở đây nữa — bài đã sống ở mục Bài đăng.
 */

export type PlanState = { error?: string; aiError?: string; success?: boolean };

const str = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);
const nullable = (v: FormDataEntryValue | null, max: number) => str(v, max) || null;

async function audit(entityId: string, action: string, payload: unknown) {
  await prisma.auditLog.create({
    data: { entityType: "mkt_plan", entityId, field: "*", newValue: JSON.stringify(payload), action, changedBy: await getCurrentStaffId() },
  });
}

function readChannels(formData: FormData): string {
  return channelsToCsv(MKT_CHANNELS.filter((c) => String(formData.get(`channel_${c}`) ?? "") !== ""));
}

async function readRefs(formData: FormData): Promise<{ contentTypeId: string | null; projectId: string | null } | { error: string }> {
  const contentTypeId = nullable(formData.get("contentTypeId"), 64);
  const projectId = nullable(formData.get("projectId"), 64);
  if (contentTypeId && !(await prisma.optionItem.findFirst({ where: { id: contentTypeId, set: { code: "mkt_content_type" } }, select: { id: true } })))
    return { error: "BAD_REF" };
  if (projectId && !(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) return { error: "BAD_REF" };
  return { contentTypeId, projectId };
}

export async function createPlanItem(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requirePermission("mkt.review");
  const staffId = await getCurrentStaffId();
  const weekStart = parseWeekKey(str(formData.get("weekStart"), 10));
  if (!weekStart) return { error: "BAD_WEEK" };
  const title = str(formData.get("title"), MAX_MKT_TITLE);
  if (!title) return { error: "NO_TITLE" };
  const channels = readChannels(formData);
  if (!channels) return { error: "NO_CHANNEL" };
  const refs = await readRefs(formData);
  if ("error" in refs) return { error: refs.error };

  const created = await prisma.mktPlanItem.create({
    data: {
      weekStart,
      title,
      keyPoints: str(formData.get("keyPoints"), MAX_MKT_KEY_POINTS),
      channels,
      note: nullable(formData.get("note"), MAX_MKT_NOTE),
      ...refs,
      createdById: staffId,
      // MKT-3: dòng HR tự thêm tay được đóng dấu duyệt NGAY — người tạo đã là người có quyền duyệt,
      // bắt họ bấm duyệt lại chính dòng mình vừa gõ là thêm bước vô nghĩa. Chỉ dòng AI đề xuất
      // (thuộc kế hoạch tháng) mới phải chờ bấm Duyệt tháng.
      approvedAt: new Date(),
      approvedById: staffId,
    },
  });
  await audit(created.id, "CREATE", { weekStart: weekKey(weekStart), title, channels });
  revalidatePath("/mkt/plan");
  return { success: true };
}

export async function updatePlanItem(id: string, _prev: PlanState, formData: FormData): Promise<PlanState> {
  await requirePermission("mkt.review");
  const item = await prisma.mktPlanItem.findUnique({ where: { id }, select: { status: true } });
  if (!item) return { error: "NOT_FOUND" };
  if (item.status === "DRAFTED") return { error: "LOCKED" };
  const weekStart = parseWeekKey(str(formData.get("weekStart"), 10));
  if (!weekStart) return { error: "BAD_WEEK" };
  const title = str(formData.get("title"), MAX_MKT_TITLE);
  if (!title) return { error: "NO_TITLE" };
  const channels = readChannels(formData);
  if (!channels) return { error: "NO_CHANNEL" };
  const refs = await readRefs(formData);
  if ("error" in refs) return { error: refs.error };

  await prisma.mktPlanItem.update({
    where: { id },
    data: { weekStart, title, keyPoints: str(formData.get("keyPoints"), MAX_MKT_KEY_POINTS), channels, note: nullable(formData.get("note"), MAX_MKT_NOTE), ...refs },
  });
  await audit(id, "UPDATE", { weekStart: weekKey(weekStart), title, channels });
  revalidatePath("/mkt/plan");
  return { success: true };
}

/** Bỏ (SKIPPED) hoặc khôi phục (PLANNED) một dòng chưa dựng bài. */
export async function togglePlanItemSkip(id: string): Promise<void> {
  await requirePermission("mkt.review");
  const item = await prisma.mktPlanItem.findUnique({ where: { id }, select: { status: true } });
  if (!item || item.status === "DRAFTED") return;
  const status = item.status === "SKIPPED" ? "PLANNED" : "SKIPPED";
  await prisma.mktPlanItem.update({ where: { id }, data: { status } });
  await audit(id, "UPDATE", { status });
  revalidatePath("/mkt/plan");
}

export async function deletePlanItem(id: string): Promise<void> {
  await requirePermission("mkt.review");
  const item = await prisma.mktPlanItem.findUnique({ where: { id }, select: { status: true, title: true } });
  if (!item || item.status === "DRAFTED") return;
  await prisma.mktPlanItem.delete({ where: { id } });
  await audit(id, "DELETE", { title: item.title });
  revalidatePath("/mkt/plan");
}

/** "Dựng bài ngay" — không đợi tới hạn. Cùng đường với job (AI chạy nền, báo lại khi xong). */
export async function draftPlanItemNow(id: string, _prev: PlanState, _formData: FormData): Promise<PlanState> {
  await requirePermission("mkt.review");
  const item = await prisma.mktPlanItem.findUnique({
    where: { id },
    select: { id: true, weekStart: true, title: true, keyPoints: true, channels: true, contentTypeId: true, projectId: true, createdById: true, status: true },
  });
  if (!item) return { error: "NOT_FOUND" };
  if (item.status !== "PLANNED") return { error: "WRONG_STATE" };
  const postId = await draftPlanItem(item);
  if (!postId) return { error: "WRONG_STATE" };
  revalidatePath("/mkt/plan");
  revalidatePath("/mkt");
  return { success: true };
}

// ─────────────────────────────────────────────────────────
// Designer nhận brief
// ─────────────────────────────────────────────────────────

export async function saveDesigners(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requirePermission("mkt.review");
  const wanted = [...new Set(formData.getAll("designerId").map((v) => String(v)).filter(Boolean))];
  // Chỉ nhận người đang hoạt động — không tin payload.
  const valid = (await prisma.staff.findMany({ where: { id: { in: wanted }, isActive: true }, select: { id: true } })).map((s) => s.id);
  const staffId = await getCurrentStaffId();
  await prisma.setting.upsert({
    where: { module_key_scope_scopeRef: { module: "mkt", key: "designer_staff_ids", scope: "GLOBAL", scopeRef: "" } },
    update: { value: JSON.stringify(valid), updatedBy: staffId },
    create: { module: "mkt", key: "designer_staff_ids", value: JSON.stringify(valid), updatedBy: staffId },
  });
  await audit("designers", "UPDATE", { count: valid.length });
  revalidatePath("/mkt/plan");
  return { success: true };
}
