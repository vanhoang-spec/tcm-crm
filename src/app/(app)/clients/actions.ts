"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import {
  getClientFormSchema,
  getContactListSchema,
  MAX_CONTACTS,
  OTHER_INTRODUCER,
} from "@/lib/validators/client";
import { requirePermission } from "@/lib/permissions";

function toNullable(v: string | undefined) {
  return v && v.trim() !== "" ? v : null;
}

/** "OTHER" (Khác — không phải nhân viên công ty) → lưu introducerId = null. */
function resolveIntroducerId(introducerId: string) {
  return introducerId === OTHER_INTRODUCER ? null : introducerId;
}

export type ClientFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /**
   * Giá trị vừa gửi lên, trả ngược để form dựng lại đúng những gì người dùng đã gõ.
   *
   * Bắt buộc phải có: sau mỗi form action React reset các input KHÔNG kiểm soát về `defaultValue`.
   * Với form tạo mới (không có defaultValues) thì reset = trắng trơn — mỗi lần validation trượt là
   * mất sạch ~15 ô đã nhập. Form khách hàng có tới 4 vòng lỗi mới qua được, tức gõ lại 4 lần.
   */
  values?: Record<string, string>;
};

/** Gom mọi ô text của form để trả ngược khi có lỗi. Bỏ field nội bộ của React ($ACTION_*). */
function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) out[key] = value;
  }
  return out;
}

async function parseClientForm(formData: FormData) {
  const t = await getTranslations("validation.client");
  const raw = {
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    taxCode: String(formData.get("taxCode") ?? ""),
    brandName: String(formData.get("brandName") ?? ""),
    industryId: String(formData.get("industryId") ?? ""),
    statusId: String(formData.get("statusId") ?? ""),
    classificationId: String(formData.get("classificationId") ?? ""),
    ownerTeamId: String(formData.get("ownerTeamId") ?? ""),
    introducerId: String(formData.get("introducerId") ?? ""),
    isNew: formData.get("isNew") === "on",
    paymentTermDays: String(formData.get("paymentTermDays") ?? "90"),
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    bankAccount: String(formData.get("bankAccount") ?? ""),
    note: String(formData.get("note") ?? ""),
  };

  return getClientFormSchema(t).safeParse(raw);
}

/** Đọc mảng người liên hệ từ FormData: contact_name_0, contact_title_0, ... (index 0-9). */
function parseContactsFromFormData(formData: FormData) {
  const rows: { name: string; title: string; phone: string; email: string }[] = [];
  for (let i = 0; i < MAX_CONTACTS; i++) {
    const name = String(formData.get(`contact_name_${i}`) ?? "").trim();
    const title = String(formData.get(`contact_title_${i}`) ?? "").trim();
    const phone = String(formData.get(`contact_phone_${i}`) ?? "").trim();
    const email = String(formData.get(`contact_email_${i}`) ?? "").trim();
    if (!name && !title && !phone && !email) continue; // dòng trống bị bỏ qua
    rows.push({ name, title, phone, email });
  }
  return rows;
}

async function resolveBrandId(brandName: string) {
  const brand = await prisma.brand.upsert({
    where: { name: brandName.trim() },
    update: {},
    create: { name: brandName.trim() },
  });
  return brand.id;
}

/** Khách hàng mới tạo luôn ở "Tiềm năng" — không cho chọn tay lúc tạo mới. */
async function resolvePotentialStatusId() {
  const item = await prisma.optionItem.findFirst({
    where: { set: { code: "client_status" }, code: "POTENTIAL" },
  });
  if (!item) throw new Error("Missing option_item client_status/POTENTIAL — run seed.");
  return item.id;
}

export async function createClient(_prevState: ClientFormState, formData: FormData): Promise<ClientFormState> {
  await requirePermission("clients.manage");
  const tContact = await getTranslations("validation.contact");
  const parsed = await parseClientForm(formData);
  const contactsParsed = getContactListSchema(tContact).safeParse(parseContactsFromFormData(formData));

  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) Object.assign(fieldErrors, flattenZodErrors(parsed.error));
  if (!contactsParsed.success) {
    const issue = contactsParsed.error.issues[0];
    const rowIndex = typeof issue?.path[0] === "number" ? issue.path[0] : null;
    fieldErrors.contacts =
      rowIndex !== null
        ? tContact("rowError", { n: rowIndex + 1, message: issue.message })
        : (issue?.message ?? tContact("listInvalid"));
  }
  if (!parsed.success || !contactsParsed.success) {
    return { fieldErrors, values: formValues(formData) };
  }
  const data = parsed.data;
  const contacts = contactsParsed.data;

  const tClient = await getTranslations("validation.client");
  const existing = await prisma.client.findUnique({ where: { code: data.code } });
  if (existing) {
    return { fieldErrors: { code: tClient("codeExists") }, values: formValues(formData) };
  }

  const staffId = await getCurrentStaffId();
  const brandId = await resolveBrandId(data.brandName);
  const statusId = await resolvePotentialStatusId();

  const client = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        code: data.code,
        name: data.name,
        taxCode: data.taxCode,
        brandId,
        industryId: data.industryId,
        statusId,
        classificationId: data.classificationId,
        ownerTeamId: data.ownerTeamId,
        introducerId: resolveIntroducerId(data.introducerId),
        isNew: data.isNew,
        paymentTermDays: data.paymentTermDays,
        address: data.address,
        phone: data.phone,
        email: data.email,
        bankAccount: data.bankAccount,
        note: toNullable(data.note),
      },
    });

    await tx.contact.createMany({
      data: contacts.map((c, i) => ({ ...c, clientId: created.id, isPrimary: i === 0 })),
    });

    await tx.auditLog.create({
      data: {
        entityType: "client",
        entityId: created.id,
        field: "*",
        newValue: JSON.stringify({ ...data, brandId, statusId, contactsCount: contacts.length }),
        action: "CREATE",
        changedBy: staffId,
      },
    });

    return created;
  });

  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function updateClient(
  clientId: string,
  _prevState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  await requirePermission("clients.manage");
  const tClient = await getTranslations("validation.client");
  const parsed = await parseClientForm(formData);
  if (!parsed.success) {
    return { fieldErrors: flattenZodErrors(parsed.error), values: formValues(formData) };
  }
  const data = parsed.data;

  const before = await prisma.client.findUnique({ where: { id: clientId } });
  if (!before) {
    return { error: tClient("notFound") };
  }

  const duplicateCode = await prisma.client.findFirst({
    where: { code: data.code, NOT: { id: clientId } },
  });
  if (duplicateCode) {
    return { fieldErrors: { code: tClient("codeExists") }, values: formValues(formData) };
  }

  const staffId = await getCurrentStaffId();
  const brandId = await resolveBrandId(data.brandName);

  const after = {
    code: data.code,
    name: data.name,
    taxCode: data.taxCode,
    brandId,
    industryId: data.industryId,
    statusId: data.statusId,
    classificationId: data.classificationId,
    ownerTeamId: data.ownerTeamId,
    introducerId: resolveIntroducerId(data.introducerId),
    isNew: data.isNew,
    paymentTermDays: data.paymentTermDays,
    address: data.address,
    phone: data.phone,
    email: data.email,
    bankAccount: data.bankAccount,
    note: toNullable(data.note),
  };

  await prisma.client.update({ where: { id: clientId }, data: after });

  const changedFields = (Object.keys(after) as (keyof typeof after)[]).filter(
    (key) => String(before[key] ?? "") !== String(after[key] ?? ""),
  );
  if (changedFields.length > 0) {
    await prisma.auditLog.createMany({
      data: changedFields.map((field) => ({
        entityType: "client",
        entityId: clientId,
        field,
        oldValue: before[field] === null || before[field] === undefined ? null : String(before[field]),
        newValue: after[field] === null || after[field] === undefined ? null : String(after[field]),
        action: "UPDATE",
        changedBy: staffId,
      })),
    });
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function transferClient(clientId: string, toTeamId: string, reason: string) {
  await requirePermission("clients.transfer");
  const staffId = await getCurrentStaffId();
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });

  if (client.ownerTeamId === toTeamId) return;

  await prisma.$transaction([
    // Khách chưa có team (vd cấp BGĐ) không có "team cũ" để ghi log ClientTransfer (fromTeamId bắt buộc) —
    // chỉ log chuyển giao thật khi có team nguồn, lần "giao team đầu tiên" chỉ update thẳng.
    ...(client.ownerTeamId
      ? [
          prisma.clientTransfer.create({
            data: {
              clientId,
              fromTeamId: client.ownerTeamId,
              toTeamId,
              reason,
              transferredById: staffId ?? "",
            },
          }),
        ]
      : []),
    prisma.client.update({ where: { id: clientId }, data: { ownerTeamId: toTeamId } }),
    prisma.auditLog.create({
      data: {
        entityType: "client",
        entityId: clientId,
        field: "ownerTeamId",
        oldValue: client.ownerTeamId,
        newValue: toTeamId,
        action: "UPDATE",
        changedBy: staffId,
        reason,
      },
    }),
  ]);

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
}

export async function addCareNote(clientId: string, formData: FormData) {
  await requirePermission("clients.care");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  const staffId = await getCurrentStaffId();
  await prisma.careNote.create({
    data: { clientId, note, staffId },
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients/care-report");
}

export async function addContact(clientId: string, formData: FormData) {
  await requirePermission("clients.manage");
  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!name || !title || !phone || !email) return;

  const count = await prisma.contact.count({ where: { clientId } });
  if (count >= MAX_CONTACTS) return;

  const isPrimary = formData.get("isPrimary") === "on";
  if (isPrimary) {
    await prisma.contact.updateMany({ where: { clientId }, data: { isPrimary: false } });
  }

  await prisma.contact.create({
    data: { clientId, name, title, phone, email, isPrimary },
  });

  revalidatePath(`/clients/${clientId}`);
}

export async function transferClientAction(clientId: string, formData: FormData) {
  await requirePermission("clients.transfer");
  const toTeamId = String(formData.get("toTeamId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!toTeamId || !reason) return;
  await transferClient(clientId, toTeamId, reason);
}

function flattenZodErrors(error: import("zod").ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
