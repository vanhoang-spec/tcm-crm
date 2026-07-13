"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { clientFormSchema } from "@/lib/validators/client";

function toNullable(v: string | undefined) {
  return v && v.trim() !== "" ? v : null;
}

export type ClientFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

async function parseClientForm(formData: FormData) {
  const raw = {
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    industryId: String(formData.get("industryId") ?? ""),
    ownerTeamId: String(formData.get("ownerTeamId") ?? ""),
    introducerId: String(formData.get("introducerId") ?? ""),
    isNew: formData.get("isNew") === "on",
    paymentTermDays: String(formData.get("paymentTermDays") ?? "90"),
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    note: String(formData.get("note") ?? ""),
  };

  return clientFormSchema.safeParse(raw);
}

export async function createClient(_prevState: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const parsed = await parseClientForm(formData);
  if (!parsed.success) {
    return { fieldErrors: flattenZodErrors(parsed.error) };
  }
  const data = parsed.data;

  const existing = await prisma.client.findUnique({ where: { code: data.code } });
  if (existing) {
    return { fieldErrors: { code: "Mã khách hàng đã tồn tại" } };
  }

  const staffId = await getCurrentStaffId();

  const client = await prisma.client.create({
    data: {
      code: data.code,
      name: data.name,
      brand: toNullable(data.brand),
      industryId: toNullable(data.industryId),
      ownerTeamId: data.ownerTeamId,
      introducerId: toNullable(data.introducerId),
      isNew: data.isNew,
      paymentTermDays: data.paymentTermDays,
      address: toNullable(data.address),
      phone: toNullable(data.phone),
      email: toNullable(data.email),
      note: toNullable(data.note),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "client",
      entityId: client.id,
      field: "*",
      newValue: JSON.stringify(data),
      action: "CREATE",
      changedBy: staffId,
    },
  });

  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function updateClient(
  clientId: string,
  _prevState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const parsed = await parseClientForm(formData);
  if (!parsed.success) {
    return { fieldErrors: flattenZodErrors(parsed.error) };
  }
  const data = parsed.data;

  const before = await prisma.client.findUnique({ where: { id: clientId } });
  if (!before) {
    return { error: "Không tìm thấy khách hàng." };
  }

  const duplicateCode = await prisma.client.findFirst({
    where: { code: data.code, NOT: { id: clientId } },
  });
  if (duplicateCode) {
    return { fieldErrors: { code: "Mã khách hàng đã tồn tại" } };
  }

  const staffId = await getCurrentStaffId();

  const after = {
    code: data.code,
    name: data.name,
    brand: toNullable(data.brand),
    industryId: toNullable(data.industryId),
    ownerTeamId: data.ownerTeamId,
    introducerId: toNullable(data.introducerId),
    isNew: data.isNew,
    paymentTermDays: data.paymentTermDays,
    address: toNullable(data.address),
    phone: toNullable(data.phone),
    email: toNullable(data.email),
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
  const staffId = await getCurrentStaffId();
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });

  if (client.ownerTeamId === toTeamId) return;

  await prisma.$transaction([
    prisma.clientTransfer.create({
      data: {
        clientId,
        fromTeamId: client.ownerTeamId,
        toTeamId,
        reason,
        transferredById: staffId ?? "",
      },
    }),
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
        reason: `Chuyển khách hàng: ${reason}`,
      },
    }),
  ]);

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
}

export async function addContact(clientId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const isPrimary = formData.get("isPrimary") === "on";
  if (isPrimary) {
    await prisma.contact.updateMany({ where: { clientId }, data: { isPrimary: false } });
  }

  await prisma.contact.create({
    data: {
      clientId,
      name,
      title: toNullable(String(formData.get("title") ?? "")),
      phone: toNullable(String(formData.get("phone") ?? "")),
      email: toNullable(String(formData.get("email") ?? "")),
      isPrimary,
    },
  });

  revalidatePath(`/clients/${clientId}`);
}

export async function transferClientAction(clientId: string, formData: FormData) {
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
