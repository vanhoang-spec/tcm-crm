"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";

export type SettingsFormState = { error?: string };

export async function createOptionItem(
  setCode: string,
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requirePermission("settings.options.manage");
  const t = await getTranslations("settings.options");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const labelVi = String(formData.get("labelVi") ?? "").trim();
  const labelEn = String(formData.get("labelEn") ?? "").trim();
  if (!code || !labelVi) return { error: t("errorRequired") };

  const set = await prisma.optionSet.findUnique({ where: { code: setCode } });
  if (!set) return { error: t("errorSetNotFound") };

  const existing = await prisma.optionItem.findUnique({ where: { setId_code: { setId: set.id, code } } });
  if (existing) return { error: t("errorCodeExists", { code }) };

  const count = await prisma.optionItem.count({ where: { setId: set.id } });
  const staffId = await getCurrentStaffId();
  const item = await prisma.optionItem.create({
    data: { setId: set.id, code, labelVi, labelEn: labelEn || null, sort: count },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "option_item",
      entityId: item.id,
      field: "*",
      newValue: JSON.stringify({ setCode, code, labelVi, labelEn }),
      action: "CREATE",
      changedBy: staffId,
    },
  });

  revalidatePath(`/settings/options/${setCode}`);
  return {};
}

export async function updateOptionItem(
  itemId: string,
  setCode: string,
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requirePermission("settings.options.manage");
  const t = await getTranslations("settings.options");
  const labelVi = String(formData.get("labelVi") ?? "").trim();
  const labelEn = String(formData.get("labelEn") ?? "").trim();
  const isActive = formData.get("isActive") === "on";
  if (!labelVi) return { error: t("errorLabelRequired") };

  const before = await prisma.optionItem.findUnique({ where: { id: itemId } });
  if (!before) return { error: t("errorItemNotFound") };

  const staffId = await getCurrentStaffId();
  await prisma.optionItem.update({
    where: { id: itemId },
    data: { labelVi, labelEn: labelEn || null, isActive },
  });

  const changed: string[] = [];
  if (before.labelVi !== labelVi) changed.push("labelVi");
  if ((before.labelEn ?? "") !== labelEn) changed.push("labelEn");
  if (before.isActive !== isActive) changed.push("isActive");
  if (changed.length > 0) {
    await prisma.auditLog.createMany({
      data: changed.map((field) => ({
        entityType: "option_item",
        entityId: itemId,
        field,
        oldValue: String(before[field as keyof typeof before] ?? ""),
        newValue: field === "labelVi" ? labelVi : field === "labelEn" ? labelEn : String(isActive),
        action: "UPDATE",
        changedBy: staffId,
      })),
    });
  }

  revalidatePath(`/settings/options/${setCode}`);
  revalidatePath("/clients");
  return {};
}

/** Kéo-thả đổi thứ tự danh mục — ghi lại `sort` theo đúng thứ tự mảng id truyền vào (0-indexed). */
export async function reorderOptionItems(setCode: string, orderedIds: string[]) {
  await requirePermission("settings.options.manage");
  const set = await prisma.optionSet.findUnique({ where: { code: setCode } });
  if (!set) return;

  const staffId = await getCurrentStaffId();
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.optionItem.update({ where: { id }, data: { sort: index } }),
    ),
  );
  await prisma.auditLog.create({
    data: {
      entityType: "option_item",
      entityId: set.id,
      field: "sort",
      newValue: JSON.stringify(orderedIds),
      action: "REORDER",
      changedBy: staffId,
    },
  });

  revalidatePath(`/settings/options/${setCode}`);
  revalidatePath("/clients");
  revalidatePath("/bidding");
}
