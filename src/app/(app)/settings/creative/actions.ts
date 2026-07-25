"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { COST_REVIEW_CYCLES, type CostReviewCycle } from "@/lib/creative-cost";
import { requirePermission } from "@/lib/permissions";

export type CreativeSettingsState = { error?: string; success?: boolean };

async function upsertSetting(key: string, value: string, staffId: string | null) {
  await prisma.setting.upsert({
    where: { module_key_scope_scopeRef: { module: "creative", key, scope: "GLOBAL", scopeRef: "" } },
    update: { value, updatedBy: staffId },
    create: { module: "creative", key, value, updatedBy: staffId },
  });
}

function revalidateCreativeCost() {
  revalidatePath("/settings/creative");
  revalidatePath("/creative/cost");
}

/** Đổi chu kỳ review cost-per-task (MONTH|QUARTER|HALF|YEAR). Không quy đổi số liệu kỳ cũ. */
export async function saveCreativeCycle(
  _prev: CreativeSettingsState,
  formData: FormData,
): Promise<CreativeSettingsState> {
  await requirePermission("settings.creative.manage");
  const t = await getTranslations("settings.creative");
  const cycle = String(formData.get("cycle") ?? "");
  if (!(COST_REVIEW_CYCLES as readonly string[]).includes(cycle)) return { error: t("errorInvalid") };
  const staffId = await getCurrentStaffId();
  await upsertSetting("cost_review_cycle", cycle, staffId);
  revalidateCreativeCost();
  return { success: true };
}

/** Upsert ngân sách lương 1 vị trí cho 1 kỳ — positionTitle CỐ ĐỊNH (đến từ danh sách title CREATIVE active), không cho gõ tay. */
export async function saveSalaryBudget(
  positionTitle: string,
  periodCode: string,
  _prev: CreativeSettingsState,
  formData: FormData,
): Promise<CreativeSettingsState> {
  await requirePermission("settings.creative.manage");
  const t = await getTranslations("settings.creative");
  const monthlySalary = Number(formData.get("monthlySalary") ?? NaN);
  const headcountRaw = String(formData.get("headcountOverride") ?? "").trim();
  const headcountOverride = headcountRaw === "" ? null : Number(headcountRaw);
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isFinite(monthlySalary) || monthlySalary < 0) return { error: t("errorInvalid") };
  if (headcountOverride != null && (!Number.isFinite(headcountOverride) || headcountOverride < 0)) return { error: t("errorInvalid") };

  await prisma.creativeSalaryBudget.upsert({
    where: { positionTitle_periodCode: { positionTitle, periodCode } },
    update: { monthlySalary: BigInt(Math.round(monthlySalary)), headcountOverride: headcountOverride == null ? null : Math.round(headcountOverride), note: note || null },
    create: {
      positionTitle,
      periodCode,
      monthlySalary: BigInt(Math.round(monthlySalary)),
      headcountOverride: headcountOverride == null ? null : Math.round(headcountOverride),
      note: note || null,
    },
  });
  revalidateCreativeCost();
  return { success: true };
}

/** Xóa 1 dòng ngân sách mồ côi (title không còn khớp nhân sự CREATIVE active nào). */
export async function deleteSalaryBudget(id: string): Promise<CreativeSettingsState> {
  await requirePermission("settings.creative.manage");
  await prisma.creativeSalaryBudget.delete({ where: { id } });
  revalidateCreativeCost();
  return { success: true };
}

/**
 * Lưu cả ma trận % — 1 form bulk. Field name mã hóa theo INDEX vị trí (không dùng title trực tiếp trong tên
 * field để tránh vấn đề ký tự đặc biệt): `position_<i>` = title, `ratio_<i>_<taskTypeId>` = percent.
 * KHÔNG chuẩn hóa tổng % — lưu đúng số nhập, cảnh báo hiển thị ở trang report.
 */
export async function saveRatioMatrix(
  periodCode: string,
  _prev: CreativeSettingsState,
  formData: FormData,
): Promise<CreativeSettingsState> {
  await requirePermission("settings.creative.manage");
  const t = await getTranslations("settings.creative");
  const positions = new Map<number, string>();
  for (const [key, value] of formData.entries()) {
    const m = /^position_(\d+)$/.exec(key);
    if (m) positions.set(Number(m[1]), String(value));
  }

  const rows: { positionTitle: string; taskTypeId: string; percent: number }[] = [];
  for (const [key, value] of formData.entries()) {
    const m = /^ratio_(\d+)_(.+)$/.exec(key);
    if (!m) continue;
    const idx = Number(m[1]);
    const taskTypeId = m[2];
    const title = positions.get(idx);
    if (!title) continue;
    const percent = Number(value);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return { error: t("errorRatioRange") };
    rows.push({ positionTitle: title, taskTypeId, percent });
  }

  await prisma.$transaction(
    rows.map((r) =>
      prisma.creativeAllocationRatio.upsert({
        where: { positionTitle_taskTypeId_periodCode: { positionTitle: r.positionTitle, taskTypeId: r.taskTypeId, periodCode } },
        update: { percent: r.percent },
        create: { positionTitle: r.positionTitle, taskTypeId: r.taskTypeId, periodCode, percent: r.percent },
      }),
    ),
  );
  revalidateCreativeCost();
  return { success: true };
}

/**
 * Copy toàn bộ budget + ratio từ kỳ trước sang kỳ hiện tại (khi đổi cycle hoặc kỳ mới chưa có dữ liệu).
 * KHÔNG tự quy đổi số tháng/tỉ lệ giữa các loại chu kỳ khác nhau — copy y nguyên giá trị.
 */
export async function copyFromPreviousPeriod(fromPeriodCode: string, toPeriodCode: string): Promise<CreativeSettingsState> {
  await requirePermission("settings.creative.manage");
  const [budgets, ratios] = await Promise.all([
    prisma.creativeSalaryBudget.findMany({ where: { periodCode: fromPeriodCode } }),
    prisma.creativeAllocationRatio.findMany({ where: { periodCode: fromPeriodCode } }),
  ]);
  if (budgets.length === 0 && ratios.length === 0) return { error: "NO_SOURCE_PERIOD" };

  await prisma.$transaction([
    ...budgets.map((b) =>
      prisma.creativeSalaryBudget.upsert({
        where: { positionTitle_periodCode: { positionTitle: b.positionTitle, periodCode: toPeriodCode } },
        update: {},
        create: { positionTitle: b.positionTitle, periodCode: toPeriodCode, monthlySalary: b.monthlySalary, headcountOverride: null, note: b.note },
      }),
    ),
    ...ratios.map((r) =>
      prisma.creativeAllocationRatio.upsert({
        where: { positionTitle_taskTypeId_periodCode: { positionTitle: r.positionTitle, taskTypeId: r.taskTypeId, periodCode: toPeriodCode } },
        update: {},
        create: { positionTitle: r.positionTitle, taskTypeId: r.taskTypeId, periodCode: toPeriodCode, percent: r.percent },
      }),
    ),
  ]);
  revalidateCreativeCost();
  return { success: true };
}

export type { CostReviewCycle };
