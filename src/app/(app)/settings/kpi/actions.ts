"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { KPI_DEPT_CODES } from "@/lib/kpi";
import { requirePermission } from "@/lib/permissions";

export type KpiSettingsState = { error?: string; success?: boolean };

async function upsertSetting(key: string, value: string, staffId: string | null) {
  await prisma.setting.upsert({
    where: { module_key_scope_scopeRef: { module: "kpi", key, scope: "GLOBAL", scopeRef: "" } },
    update: { value, updatedBy: staffId },
    create: { module: "kpi", key, value, updatedBy: staffId },
  });
}

function revalidateKpi() {
  revalidatePath("/settings/kpi");
  revalidatePath("/kpi");
}

async function audit(entityType: string, entityId: string, field: string, oldValue: string | null, newValue: string, staffId: string | null) {
  await prisma.auditLog.create({
    data: { entityType, entityId, field, oldValue, newValue, action: "UPDATE", changedBy: staffId },
  });
}

/** Lưu 7 tham số quỹ 75/25. Đổi tham số KHÔNG ảnh hưởng kỳ đã chốt (đọc từ snapshot). */
export async function saveKpiParams(_prev: KpiSettingsState, formData: FormData): Promise<KpiSettingsState> {
  await requirePermission("settings.kpi.manage");
  const t = await getTranslations("settings.kpi");
  const fields: { key: string; min: number; max: number }[] = [
    { key: "pool_percent", min: 0, max: 100 },
    { key: "target_margin_pct", min: 0, max: 100 },
    { key: "floor_margin_pct", min: 0, max: 100 },
    { key: "floor_factor", min: 0, max: 2 },
    { key: "cap_factor", min: 0, max: 2 },
    { key: "empty_window_factor", min: 0, max: 2 },
    { key: "margin_window_months", min: 1, max: 12 },
  ];
  const values: Record<string, number> = {};
  for (const f of fields) {
    const v = Number(formData.get(f.key) ?? NaN);
    if (!Number.isFinite(v) || v < f.min || v > f.max) return { error: t("errorInvalid") };
    values[f.key] = v;
  }
  if (values.floor_margin_pct >= values.target_margin_pct) return { error: t("errorInvalid") };
  const staffId = await getCurrentStaffId();
  for (const f of fields) await upsertSetting(f.key, String(values[f.key]), staffId);
  revalidateKpi();
  return { success: true };
}

/** Tạo/sửa tiêu chí. id rỗng = tạo mới (code phải unique). KHÔNG hard-delete — chỉ toggle isActive. */
export async function saveKpiCriterion(id: string | null, _prev: KpiSettingsState, formData: FormData): Promise<KpiSettingsState> {
  await requirePermission("settings.kpi.manage");
  const t = await getTranslations("settings.kpi");
  const nameVi = String(formData.get("nameVi") ?? "").trim();
  const nameEn = String(formData.get("nameEn") ?? "").trim();
  const appliesTo = String(formData.get("appliesTo") ?? "ALL");
  const weight = Number(formData.get("weight") ?? NaN);
  const scaleMax = Number(formData.get("scaleMax") ?? NaN);

  const validApplies = ["ALL", "ACCOUNT", "LEAD", ...KPI_DEPT_CODES.filter((d) => d !== "ACCOUNT")];
  if (!nameVi || !validApplies.includes(appliesTo)) return { error: t("errorInvalid") };
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) return { error: t("errorInvalid") };
  if (!Number.isFinite(scaleMax) || scaleMax < 1 || scaleMax > 100) return { error: t("errorInvalid") };

  const staffId = await getCurrentStaffId();
  if (id) {
    const before = await prisma.kpiCriterion.findUnique({ where: { id } });
    if (!before) return { error: t("errorInvalid") };
    await prisma.kpiCriterion.update({
      where: { id },
      data: { nameVi, nameEn: nameEn || null, appliesTo, weight, scaleMax: Math.round(scaleMax) },
    });
    await audit("kpi_criterion", id, "update", JSON.stringify({ nameVi: before.nameVi, weight: before.weight }), JSON.stringify({ nameVi, weight }), staffId);
  } else {
    const code = String(formData.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!code) return { error: t("errorInvalid") };
    const maxSort = await prisma.kpiCriterion.aggregate({ _max: { sort: true } });
    try {
      const created = await prisma.kpiCriterion.create({
        data: { code, nameVi, nameEn: nameEn || null, appliesTo, weight, scaleMax: Math.round(scaleMax), sort: (maxSort._max.sort ?? 0) + 1 },
      });
      await audit("kpi_criterion", created.id, "create", null, JSON.stringify({ code, nameVi, weight }), staffId);
    } catch (e) {
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") return { error: t("errorDuplicate") };
      throw e;
    }
  }
  revalidateKpi();
  return { success: true };
}

/** Bật/tắt tiêu chí (thay cho xóa — giữ lịch sử điểm). */
export async function toggleKpiCriterion(id: string): Promise<void> {
  await requirePermission("settings.kpi.manage");
  const c = await prisma.kpiCriterion.findUnique({ where: { id } });
  if (!c) return;
  await prisma.kpiCriterion.update({ where: { id }, data: { isActive: !c.isActive } });
  const staffId = await getCurrentStaffId();
  await audit("kpi_criterion", id, "isActive", String(c.isActive), String(!c.isActive), staffId);
  revalidateKpi();
}

/** Upsert lương full 1 vị trí × phòng ban cho 1 kỳ. */
export async function saveKpiPositionSalary(
  positionTitle: string,
  departmentCode: string,
  periodCode: string,
  _prev: KpiSettingsState,
  formData: FormData,
): Promise<KpiSettingsState> {
  await requirePermission("settings.kpi.manage");
  const t = await getTranslations("settings.kpi");
  const monthlySalary = Number(formData.get("monthlySalary") ?? NaN);
  const note = String(formData.get("note") ?? "").trim();
  if (!Number.isFinite(monthlySalary) || monthlySalary < 0) return { error: t("errorInvalid") };

  const staffId = await getCurrentStaffId();
  const before = await prisma.positionSalary.findUnique({
    where: { positionTitle_departmentCode_periodCode: { positionTitle, departmentCode, periodCode } },
  });
  await prisma.positionSalary.upsert({
    where: { positionTitle_departmentCode_periodCode: { positionTitle, departmentCode, periodCode } },
    update: { monthlySalary: BigInt(Math.round(monthlySalary)), note: note || null },
    create: { positionTitle, departmentCode, periodCode, monthlySalary: BigInt(Math.round(monthlySalary)), note: note || null },
  });
  await audit("position_salary", `${positionTitle}|${departmentCode}|${periodCode}`, "monthlySalary", before ? String(before.monthlySalary) : null, String(Math.round(monthlySalary)), staffId);
  revalidateKpi();
  return { success: true };
}

/** Chép toàn bộ dòng lương từ kỳ trước sang kỳ hiện tại (chỉ điền chỗ trống, không ghi đè). */
export async function copyKpiSalariesFromPeriod(fromPeriod: string, toPeriod: string): Promise<void> {
  await requirePermission("settings.kpi.manage");
  const rows = await prisma.positionSalary.findMany({ where: { periodCode: fromPeriod } });
  for (const r of rows) {
    await prisma.positionSalary.upsert({
      where: { positionTitle_departmentCode_periodCode: { positionTitle: r.positionTitle, departmentCode: r.departmentCode, periodCode: toPeriod } },
      update: {},
      create: { positionTitle: r.positionTitle, departmentCode: r.departmentCode, periodCode: toPeriod, monthlySalary: r.monthlySalary, note: r.note },
    });
  }
  revalidateKpi();
}
