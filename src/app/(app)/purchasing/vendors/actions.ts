"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { stringifyAudit } from "@/lib/utils";
import { getMyPermissions } from "@/lib/permissions";
import { RFQ_TEMPLATE_CODES, isRfqTemplateCode } from "@/lib/rfq-templates";
import { VENDOR_DOC_KINDS, RFQ_FILE_MIME_TYPES, MAX_RFQ_FILE_BYTES, type VendorDocKind } from "@/lib/rfq";
import { VENDOR_CODE_RE, VENDOR_CODE_LEGACY_RE, MAX_VENDOR_CONTACTS, collectCustomValues, readCustomJson, parseOptions } from "@/lib/vendor-fields";
import { saveRfqFile, deleteRfqFile } from "@/lib/rfq-storage";

export type VendorFormState = { error?: string; errorDetail?: string; success?: boolean };

/**
 * PUR-1/2 — hồ sơ NCC sống trong sub-module Thu mua. Gác BẰNG MỘT TRONG HAI mã: `purchasing.vendor.manage`
 * (PUR + BGĐ — chủ dự án 16/08/2026: PUR được nhập thông tin NCC) hoặc `settings.vendors.manage` (mã cũ).
 * Không xoá NCC (chứng từ trỏ vào), chỉ tắt isActive.
 */
async function requireVendorManage(): Promise<void> {
  const perms = await getMyPermissions();
  if (perms.has("purchasing.vendor.manage") || perms.has("settings.vendors.manage")) return;
  redirect(perms.has("purchasing.view") ? "/purchasing/vendors" : "/no-access");
}

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

function readGroups(formData: FormData): string[] {
  return RFQ_TEMPLATE_CODES.filter((code) => formData.get(`group_${code}`) === "on");
}

/** Đồng bộ bảng nối nhóm hàng về đúng tập được tick (thêm thiếu, xoá thừa). */
async function syncGroups(vendorId: string, groups: string[]) {
  const wanted = new Set<string>(groups.filter(isRfqTemplateCode));
  const current = await prisma.vendorGroup.findMany({ where: { vendorId }, select: { id: true, groupCode: true } });
  const toDelete = current.filter((g) => !wanted.has(g.groupCode)).map((g) => g.id);
  const have = new Set(current.map((g) => g.groupCode));
  const toCreate = [...wanted].filter((g) => !have.has(g));
  await prisma.$transaction([
    ...(toDelete.length ? [prisma.vendorGroup.deleteMany({ where: { id: { in: toDelete } } })] : []),
    ...(toCreate.length ? [prisma.vendorGroup.createMany({ data: toCreate.map((groupCode) => ({ vendorId, groupCode })) })] : []),
  ]);
}

/**
 * Người liên hệ 1..N từ form: `contact_<i>_name/_title/_phone/_email` (i = 0..MAX-1), người chính =
 * radio `contactPrimary` = i (mặc định người đầu có tên). Dòng không có tên = bỏ. Ghi đè toàn bộ
 * danh sách (xoá cũ, tạo mới — bảng nhỏ, không có FK trỏ vào) rồi đồng bộ người chính lên 3 cột cũ.
 */
function readContacts(formData: FormData): { name: string; title: string | null; phone: string | null; email: string | null; isPrimary: boolean }[] {
  const primaryIdx = Number(formData.get("contactPrimary") ?? NaN);
  const rows: { name: string; title: string | null; phone: string | null; email: string | null; isPrimary: boolean }[] = [];
  for (let i = 0; i < MAX_VENDOR_CONTACTS; i++) {
    const name = str(formData.get(`contact_${i}_name`)).slice(0, 120);
    if (!name) continue;
    rows.push({
      name,
      title: nullable(formData.get(`contact_${i}_title`)),
      phone: nullable(formData.get(`contact_${i}_phone`)),
      email: nullable(formData.get(`contact_${i}_email`)),
      isPrimary: primaryIdx === i,
    });
  }
  if (rows.length && !rows.some((r) => r.isPrimary)) rows[0].isPrimary = true;
  return rows;
}

async function writeContacts(vendorId: string, rows: ReturnType<typeof readContacts>) {
  const primary = rows.find((r) => r.isPrimary) ?? null;
  await prisma.$transaction([
    prisma.vendorContact.deleteMany({ where: { vendorId } }),
    ...(rows.length ? [prisma.vendorContact.createMany({ data: rows.map((r, i) => ({ vendorId, ...r, sort: i })) })] : []),
    // 3 cột cũ = người liên hệ CHÍNH — chỗ đọc cũ (nếu có) không phải đổi.
    prisma.vendor.update({ where: { id: vendorId }, data: { contact: primary?.name ?? null, phone: primary?.phone ?? null, email: primary?.email ?? null } }),
  ]);
}

/** Định nghĩa trường tuỳ chỉnh đang bật — đọc ở server lúc ghi, KHÔNG tin danh sách client gửi. */
async function activeFieldDefs() {
  const defs = await prisma.vendorFieldDef.findMany({ where: { isActive: true }, orderBy: { sort: "asc" } });
  return defs.map((d) => ({ key: d.key, labelVi: d.labelVi, labelEn: d.labelEn, type: d.type, options: parseOptions(d.optionsJson), hint: d.hint, required: d.required }));
}

function profileData(formData: FormData) {
  return {
    legalName: nullable(formData.get("legalName")),
    taxCode: nullable(formData.get("taxCode")),
    address: nullable(formData.get("address")),
    bankName: nullable(formData.get("bankName")),
    bankAccountNo: nullable(formData.get("bankAccountNo")),
    bankAccountHolder: nullable(formData.get("bankAccountHolder")),
    paymentTermsNote: nullable(formData.get("paymentTermsNote")),
    note: nullable(formData.get("note")),
  };
}

export async function createVendor(_prev: VendorFormState, formData: FormData): Promise<VendorFormState> {
  await requireVendorManage();
  const name = str(formData.get("name")).slice(0, 200);
  const code = str(formData.get("code")).toUpperCase();
  const category = str(formData.get("category")) || "PCC";
  if (!name || !code) return { error: "REQUIRED" };
  // Chuẩn PUR-2: đúng 3 ký tự A-Z0-9 (như Client.code).
  if (!VENDOR_CODE_RE.test(code)) return { error: "CODE_FORMAT" };
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) return { error: "REQUIRED" };
  if (await prisma.vendor.findUnique({ where: { code } })) return { error: "CODE_DUP" };
  const defs = await activeFieldDefs();
  const custom = collectCustomValues(formData, defs, {});
  if (custom.missing.length) return { error: "CUSTOM_REQUIRED", errorDetail: defs.filter((d) => custom.missing.includes(d.key)).map((d) => d.labelVi).join(", ") };
  const contacts = readContacts(formData);

  const created = await prisma.vendor.create({
    data: { code, name, category, ...profileData(formData), customJson: Object.keys(custom.values).length ? JSON.stringify(custom.values) : null },
  });
  await syncGroups(created.id, readGroups(formData));
  await writeContacts(created.id, contacts);
  await audit(created.id, "CREATE", { code, name, category, groups: readGroups(formData), contacts: contacts.length });
  revalidatePath("/purchasing/vendors");
  redirect(`/purchasing/vendors/${created.id}`);
}

export async function updateVendor(vendorId: string, _prev: VendorFormState, formData: FormData): Promise<VendorFormState> {
  await requireVendorManage();
  const existing = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { code: true, customJson: true } });
  if (!existing) return { error: "NOT_FOUND" };
  const name = str(formData.get("name")).slice(0, 200);
  if (!name) return { error: "REQUIRED" };
  const category = str(formData.get("category"));
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) return { error: "REQUIRED" };
  // Mã: giữ nguyên mã cũ (kể cả dài hơn 3) thì OK; ĐỔI thì phải theo chuẩn 3 ký tự + không trùng.
  const code = str(formData.get("code")).toUpperCase() || existing.code;
  if (code !== existing.code) {
    if (!VENDOR_CODE_RE.test(code)) return { error: "CODE_FORMAT" };
    if (await prisma.vendor.findUnique({ where: { code } })) return { error: "CODE_DUP" };
  } else if (!VENDOR_CODE_LEGACY_RE.test(code)) return { error: "CODE_FORMAT" };
  const defs = await activeFieldDefs();
  const custom = collectCustomValues(formData, defs, readCustomJson(existing.customJson));
  if (custom.missing.length) return { error: "CUSTOM_REQUIRED", errorDetail: defs.filter((d) => custom.missing.includes(d.key)).map((d) => d.labelVi).join(", ") };
  const groups = readGroups(formData);
  const contacts = readContacts(formData);

  await prisma.vendor.update({
    where: { id: vendorId },
    data: { code, name, category, isActive: formData.get("isActive") === "on", ...profileData(formData), customJson: Object.keys(custom.values).length ? JSON.stringify(custom.values) : null },
  });
  await syncGroups(vendorId, groups);
  await writeContacts(vendorId, contacts);
  await audit(vendorId, "UPDATE", { code: code !== existing.code ? `${existing.code}→${code}` : code, name, category, groups, contacts: contacts.length });
  revalidatePath("/purchasing/vendors");
  revalidatePath(`/purchasing/vendors/${vendorId}`);
  return { success: true };
}

export type VendorDocState = { error?: string; success?: boolean };

/**
 * Lưu tài liệu NCC (báo giá đã nhận / PO / hợp đồng đã ký) — "chốt order và ký HĐ thì PUR phải lưu
 * lại để tracking và đề xuất giá trong tương lai" (chủ dự án 15/08/2026). File vào storage/rfq-uploads,
 * đọc qua /api/vendor-doc/[id] (kiểm belongs-to). Không AI ở đây.
 */
export async function uploadVendorDocument(vendorId: string, _prev: VendorDocState, formData: FormData): Promise<VendorDocState> {
  await requireVendorManage();
  const staffId = await getCurrentStaffId();
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
  if (!vendor) return { error: "NOT_FOUND" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "NO_FILE" };
  if (!(RFQ_FILE_MIME_TYPES as readonly string[]).includes(file.type)) return { error: "BAD_TYPE" };
  if (file.size > MAX_RFQ_FILE_BYTES) return { error: "TOO_BIG" };

  const kindRaw = str(formData.get("kind"));
  const kind: VendorDocKind = (VENDOR_DOC_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as VendorDocKind) : "OTHER";
  const title = str(formData.get("title")) || file.name;
  const amountRaw = str(formData.get("amount")).replace(/[^\d]/g, "");
  const amount = amountRaw ? BigInt(amountRaw) : null;
  const signedAtRaw = str(formData.get("signedAt"));
  const signedAt = /^\d{4}-\d{2}-\d{2}$/.test(signedAtRaw) ? new Date(signedAtRaw) : null; // UTC-midnight (HANDOVER 4.3)
  const projectId = nullable(formData.get("projectId"));
  if (projectId && !(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) return { error: "NOT_FOUND" };

  const key = await saveRfqFile(Buffer.from(await file.arrayBuffer()), file.type);
  const doc = await prisma.vendorDocument.create({
    data: { vendorId, projectId, kind, title, fileKey: key, mime: file.type, size: file.size, amount, signedAt, note: nullable(formData.get("note")), uploadedById: staffId },
    select: { id: true },
  });
  await audit(vendorId, "DOC_UPLOAD", { docId: doc.id, kind, title, amount: amount?.toString() ?? null });
  revalidatePath(`/purchasing/vendors/${vendorId}`);
  return { success: true };
}

export async function deleteVendorDocument(docId: string) {
  await requireVendorManage();
  const doc = await prisma.vendorDocument.findUnique({ where: { id: docId }, select: { id: true, vendorId: true, fileKey: true, title: true } });
  if (!doc) return;
  await prisma.vendorDocument.delete({ where: { id: docId } });
  await deleteRfqFile(doc.fileKey);
  await audit(doc.vendorId, "DOC_DELETE", { docId, title: doc.title });
  revalidatePath(`/purchasing/vendors/${doc.vendorId}`);
}
