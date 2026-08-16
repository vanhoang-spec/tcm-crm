"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { VENDOR_FIELD_TYPES, fieldKeyFromLabel, type VendorFieldType } from "@/lib/vendor-fields";

/**
 * PUR-2 — danh mục TRƯỜNG TUỲ CHỈNH của hồ sơ NCC (`vendor_field_def`). Giá trị nằm ở
 * `Vendor.customJson` theo `key`. Key sinh MỘT LẦN từ nhãn Việt lúc tạo, sau đó KHÔNG đổi (đổi là
 * mọi NCC đã nhập mất giá trị). Không có đường xoá — tắt `isActive` để ẩn khỏi form, dữ liệu cũ
 * vẫn giữ nguyên trong JSON (mirror ClientGroup / JobPosition).
 */
export type VendorFieldFormState = { error?: string; success?: boolean };

type Parsed = {
  labelVi: string;
  labelEn: string | null;
  type: VendorFieldType;
  optionsJson: string | null;
  hint: string | null;
  required: boolean;
  sort: number;
};

async function parseForm(formData: FormData): Promise<{ ok: true; data: Parsed } | { ok: false; error: string }> {
  const t = await getTranslations("settings.vendorFields");
  const labelVi = String(formData.get("labelVi") ?? "").trim().slice(0, 80);
  const labelEnRaw = String(formData.get("labelEn") ?? "").trim().slice(0, 80);
  const typeRaw = String(formData.get("type") ?? "TEXT").trim();
  const hintRaw = String(formData.get("hint") ?? "").trim().slice(0, 200);
  const required = formData.get("required") === "on";
  const sortRaw = Number(String(formData.get("sort") ?? "0").trim());
  const sort = Number.isFinite(sortRaw) ? Math.max(0, Math.min(999, Math.trunc(sortRaw))) : 0;
  if (!labelVi) return { ok: false, error: t("errorRequired") };
  if (!(VENDOR_FIELD_TYPES as readonly string[]).includes(typeRaw)) return { ok: false, error: t("errorType") };
  const type = typeRaw as VendorFieldType;

  let optionsJson: string | null = null;
  if (type === "SELECT") {
    const options = Array.from(
      new Set(
        String(formData.get("options") ?? "")
          .split(/\r?\n/)
          .map((s) => s.trim().slice(0, 80))
          .filter(Boolean),
      ),
    ).slice(0, 50);
    if (options.length === 0) return { ok: false, error: t("errorOptions") };
    optionsJson = JSON.stringify(options);
  }
  return { ok: true, data: { labelVi, labelEn: labelEnRaw || null, type, optionsJson, hint: hintRaw || null, required, sort } };
}

export async function createVendorField(_prev: VendorFieldFormState, formData: FormData): Promise<VendorFieldFormState> {
  await requirePermission("settings.vendors.manage");
  const parsed = await parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  // Key duy nhất: sinh từ nhãn, trùng thì thêm hậu tố _2, _3…
  const base = fieldKeyFromLabel(parsed.data.labelVi);
  const taken = new Set((await prisma.vendorFieldDef.findMany({ where: { key: { startsWith: base } }, select: { key: true } })).map((x) => x.key));
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;

  const staffId = await getCurrentStaffId();
  const created = await prisma.vendorFieldDef.create({ data: { key, ...parsed.data } });
  await prisma.auditLog.create({
    data: { entityType: "vendor_field_def", entityId: created.id, field: "*", newValue: JSON.stringify({ key, ...parsed.data }), action: "CREATE", changedBy: staffId },
  });
  revalidatePath("/settings/vendor-fields");
  revalidatePath("/purchasing/vendors");
  return { success: true };
}

export async function updateVendorField(id: string, _prev: VendorFieldFormState, formData: FormData): Promise<VendorFieldFormState> {
  await requirePermission("settings.vendors.manage");
  const t = await getTranslations("settings.vendorFields");
  const before = await prisma.vendorFieldDef.findUnique({ where: { id } });
  if (!before) return { error: t("errorNotFound") };
  const parsed = await parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const isActive = formData.get("isActive") === "on";

  const staffId = await getCurrentStaffId();
  await prisma.vendorFieldDef.update({ where: { id }, data: { ...parsed.data, isActive } });

  const after = { ...parsed.data, isActive };
  const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => String(before[k] ?? "") !== String(after[k] ?? ""));
  if (changed.length > 0) {
    await prisma.auditLog.createMany({
      data: changed.map((field) => ({
        entityType: "vendor_field_def",
        entityId: id,
        field,
        oldValue: String(before[field] ?? ""),
        newValue: String(after[field] ?? ""),
        action: "UPDATE",
        changedBy: staffId,
      })),
    });
  }
  revalidatePath("/settings/vendor-fields");
  revalidatePath("/purchasing/vendors");
  return {};
}
