"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { stringifyAudit } from "@/lib/utils";
import { requirePermission } from "@/lib/permissions";

export type VendorFormState = { error?: string; success?: boolean };

/**
 * CRUD nhà cung cấp (C3). Trước đây KHÔNG có trang nào thêm NCC — DB chỉ có 3 NCC do seed, muốn
 * thêm phải SQL tay, trong khi PO + phiếu chi + dòng CO đều trỏ vào Vendor. Không xoá NCC (đã có
 * chứng từ trỏ vào), chỉ tắt isActive để khỏi hiện trong các ô chọn.
 */

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

const CATEGORIES = ["PCC", "PRO", "OPE", "OTHER"] as const;

async function audit(entityId: string, action: string, payload: unknown) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType: "vendor", entityId, field: "*", newValue: stringifyAudit(payload), action, changedBy: staffId },
  });
}

export async function createVendor(_prev: VendorFormState, formData: FormData): Promise<VendorFormState> {
  await requirePermission("settings.vendors.manage");
  const t = await getTranslations("settings.vendors");
  const name = str(formData.get("name"));
  const code = str(formData.get("code")).toUpperCase();
  const category = str(formData.get("category"));
  if (!name || !code) return { error: t("errRequired") };
  if (!/^[A-Z0-9-]{2,12}$/.test(code)) return { error: t("errCodeFormat") };
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) return { error: t("errRequired") };
  if (await prisma.vendor.findUnique({ where: { code } })) return { error: t("errCodeDup", { code }) };

  const created = await prisma.vendor.create({
    data: {
      code,
      name,
      category,
      contact: nullable(formData.get("contact")),
      phone: nullable(formData.get("phone")),
      email: nullable(formData.get("email")),
      taxCode: nullable(formData.get("taxCode")),
    },
  });
  await audit(created.id, "CREATE", { code, name, category });
  revalidatePath("/settings/vendors");
  return { success: true };
}

export async function updateVendor(vendorId: string, _prev: VendorFormState, formData: FormData): Promise<VendorFormState> {
  await requirePermission("settings.vendors.manage");
  const t = await getTranslations("settings.vendors");
  const name = str(formData.get("name"));
  if (!name) return { error: t("errRequired") };
  const category = str(formData.get("category"));
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) return { error: t("errRequired") };

  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      name,
      category,
      contact: nullable(formData.get("contact")),
      phone: nullable(formData.get("phone")),
      email: nullable(formData.get("email")),
      taxCode: nullable(formData.get("taxCode")),
      isActive: formData.get("isActive") === "on",
    },
  });
  await audit(vendorId, "UPDATE", { name, category });
  revalidatePath("/settings/vendors");
  return { success: true };
}
