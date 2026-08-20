"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { RFQ_GROUP_CODE_RE, fieldKeyFromLabel } from "@/lib/rfq-templates";

/**
 * PUR-3b — DANH MỤC NHÓM HÀNG RFQ khai trong app (`rfq_group` + `rfq_group_field`).
 *
 * ⚠ BA BẤT BIẾN, phá cái nào cũng mất dữ liệu trong im lặng:
 * 1. `code` sinh MỘT LẦN lúc tạo, KHÔNG có đường đổi — nó là khoá dữ liệu (VendorGroup.groupCode,
 *    Rfq.groupCode, setting production.shared_group_codes đều lưu chuỗi mã này).
 * 2. `key` của cột/điều khoản sinh MỘT LẦN từ nhãn — nó là khoá trong extraJson/termsJson của báo
 *    giá ĐÃ LƯU. Đổi key là mọi báo giá cũ mất giá trị cột đó.
 * 3. KHÔNG có đường XOÁ, chỉ tắt (`isActive`) — mirror ClientGroup / JobPosition / VendorFieldDef.
 *
 * ⚠ Nhóm HỆ THỐNG (isSystem) chỉ sửa được nhãn / mô tả / từ khoá / thứ tự / bật-tắt. Cột, điều
 * khoản và công thức thành tiền của chúng nằm ở lib/rfq-templates.ts — trong đó có nhánh viết tay
 * của nhóm nhân sự thuê ngoài (cơm × người × ngày) mà không khuôn dữ liệu nào diễn đạt được.
 */

export type RfqGroupFormState = { error?: string; success?: boolean };

const gate = () => requirePermission("settings.vendors.manage");

async function audit(entityId: string, action: string, field: string, oldValue: string | null, newValue: string) {
  await prisma.auditLog.create({
    data: { entityType: "RfqGroup", entityId, field, oldValue, newValue, action, changedBy: await getCurrentStaffId() },
  });
}

const str = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);
const int = (v: FormDataEntryValue | null, lo: number, hi: number, dflt: number) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.trunc(n))) : dflt;
};

// ── NHÓM ─────────────────────────────────────────────────────────────────────────────────────

export async function createRfqGroup(_prev: RfqGroupFormState, formData: FormData): Promise<RfqGroupFormState> {
  await gate();
  const t = await getTranslations("settings.rfqGroups");
  const code = str(formData.get("code"), 24).toUpperCase();
  const labelVi = str(formData.get("labelVi"), 80);
  if (!labelVi) return { error: t("errLabel") };
  if (!RFQ_GROUP_CODE_RE.test(code)) return { error: t("errCode") };
  if (await prisma.rfqGroup.findUnique({ where: { code } })) return { error: t("errCodeDup") };

  const created = await prisma.rfqGroup.create({
    data: {
      code,
      labelVi,
      labelEn: str(formData.get("labelEn"), 80) || labelVi,
      descVi: str(formData.get("descVi"), 300),
      descEn: str(formData.get("descEn"), 300),
      keywords: str(formData.get("keywords"), 500),
      unitPriceLabelVi: str(formData.get("unitPriceLabelVi"), 80),
      unitPriceLabelEn: str(formData.get("unitPriceLabelEn"), 80),
      isSystem: false,
      sort: int(formData.get("sort"), 0, 8999, 100),
    },
  });
  await audit(created.id, "CREATE", "group", null, `${code} · ${labelVi}`);
  revalidatePath("/settings/rfq-groups");
  revalidatePath("/purchasing/vendors");
  return { success: true };
}

export async function updateRfqGroup(groupId: string, _prev: RfqGroupFormState, formData: FormData): Promise<RfqGroupFormState> {
  await gate();
  const t = await getTranslations("settings.rfqGroups");
  const g = await prisma.rfqGroup.findUnique({ where: { id: groupId } });
  if (!g) return { error: t("errNotFound") };
  const labelVi = str(formData.get("labelVi"), 80);
  if (!labelVi) return { error: t("errLabel") };

  // ⚠ Mã KHÔNG nằm trong danh sách trường sửa được — xem bất biến 1 ở đầu file.
  await prisma.rfqGroup.update({
    where: { id: groupId },
    data: {
      labelVi,
      labelEn: str(formData.get("labelEn"), 80) || labelVi,
      descVi: str(formData.get("descVi"), 300),
      descEn: str(formData.get("descEn"), 300),
      keywords: str(formData.get("keywords"), 500),
      ...(g.isSystem
        ? {}
        : { unitPriceLabelVi: str(formData.get("unitPriceLabelVi"), 80), unitPriceLabelEn: str(formData.get("unitPriceLabelEn"), 80) }),
      sort: int(formData.get("sort"), 0, 9999, g.sort),
      isActive: formData.get("isActive") === "on",
    },
  });
  await audit(groupId, "UPDATE", "group", `${g.labelVi} · ${g.isActive ? "bật" : "tắt"}`, `${labelVi} · ${formData.get("isActive") === "on" ? "bật" : "tắt"}`);
  revalidatePath("/settings/rfq-groups");
  revalidatePath("/purchasing/vendors");
  return { success: true };
}

// ── CỘT DÒNG / ĐIỀU KHOẢN của nhóm TỰ TẠO ────────────────────────────────────────────────────

const LINE_TYPES = ["number", "text", "select", "bool"];
const TERM_TYPES = ["number", "text", "textarea"];

export async function createRfqGroupField(groupId: string, _prev: RfqGroupFormState, formData: FormData): Promise<RfqGroupFormState> {
  await gate();
  const t = await getTranslations("settings.rfqGroups");
  const g = await prisma.rfqGroup.findUnique({ where: { id: groupId }, include: { fields: true } });
  if (!g) return { error: t("errNotFound") };
  // Nhóm hệ thống: cột và điều khoản nằm ở code, thêm vào DB là đẻ ra ô không ai render.
  if (g.isSystem) return { error: t("errSystemFields") };

  const kind = String(formData.get("kind") ?? "LINE") === "TERM" ? "TERM" : "LINE";
  const labelVi = str(formData.get("labelVi"), 80);
  if (!labelVi) return { error: t("errLabel") };
  const typeRaw = String(formData.get("type") ?? "text");
  const allowed = kind === "TERM" ? TERM_TYPES : LINE_TYPES;
  if (!allowed.includes(typeRaw)) return { error: t("errType") };

  let optionsJson: string | null = null;
  if (kind === "LINE" && typeRaw === "select") {
    // Mỗi dòng một lựa chọn; "giá trị|nhãn Việt|nhãn Anh" nếu muốn tách giá trị khỏi nhãn.
    const opts = String(formData.get("options") ?? "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50)
      .map((line) => {
        const [v, vi, en] = line.split("|").map((x) => x.trim());
        return { value: (v ?? "").slice(0, 40), labelVi: (vi || v || "").slice(0, 80), labelEn: (en || vi || v || "").slice(0, 80) };
      })
      .filter((o) => o.value !== "");
    if (opts.length === 0) return { error: t("errOptions") };
    optionsJson = JSON.stringify(opts);
  }

  const taken = g.fields.filter((f) => f.kind === kind).map((f) => f.key);
  await prisma.rfqGroupField.create({
    data: {
      groupId,
      kind,
      key: fieldKeyFromLabel(labelVi, taken),
      labelVi,
      labelEn: str(formData.get("labelEn"), 80) || labelVi,
      type: typeRaw,
      optionsJson,
      hintVi: str(formData.get("hintVi"), 200) || null,
      hintEn: str(formData.get("hintEn"), 200) || null,
      defaultValue: str(formData.get("defaultValue"), 80) || null,
      // Chỉ cột SỐ mới làm hệ số được — bộ dựng mẫu cũng lọc lại, đây là chốt thứ hai.
      isAmountFactor: kind === "LINE" && typeRaw === "number" && formData.get("isAmountFactor") === "on",
      sort: int(formData.get("sort"), 0, 999, g.fields.length * 10),
    },
  });
  await audit(groupId, "UPDATE", "field", null, `+${kind} ${labelVi}`);
  revalidatePath("/settings/rfq-groups");
  return { success: true };
}

export async function toggleRfqGroupField(fieldId: string): Promise<void> {
  await gate();
  const f = await prisma.rfqGroupField.findUnique({ where: { id: fieldId } });
  if (!f) return;
  await prisma.rfqGroupField.update({ where: { id: fieldId }, data: { isActive: !f.isActive } });
  await audit(f.groupId, "UPDATE", "field", f.isActive ? "bật" : "tắt", !f.isActive ? "bật" : "tắt");
  revalidatePath("/settings/rfq-groups");
}
