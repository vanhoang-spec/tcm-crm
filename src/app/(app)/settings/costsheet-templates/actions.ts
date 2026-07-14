"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";

export type TemplateFormState = { error?: string; fieldErrors?: Record<string, string> };

function toNullable(v: string) {
  return v.trim() === "" ? null : v.trim();
}

async function audit(entityType: string, entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType, entityId, field: "*", action, changedBy: staffId, reason } });
}

// ─────────────────────────────────────────────────────────
// Template
// ─────────────────────────────────────────────────────────

export async function createTemplate(_prev: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  const t = await getTranslations("settings.costsheetTemplates");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { fieldErrors: { name: t("errorNameRequired") } };

  const created = await prisma.costsheetTemplate.create({
    data: {
      name,
      projectTypeId: toNullable(String(formData.get("projectTypeId") ?? "")),
      contractTypeId: toNullable(String(formData.get("contractTypeId") ?? "")),
    },
  });
  await audit("costsheet_template", created.id, "CREATE");

  revalidatePath("/settings/costsheet-templates");
  redirect(`/settings/costsheet-templates/${created.id}`);
}

export async function updateTemplate(templateId: string, _prev: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  const t = await getTranslations("settings.costsheetTemplates");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { fieldErrors: { name: t("errorNameRequired") } };

  await prisma.costsheetTemplate.update({
    where: { id: templateId },
    data: {
      name,
      projectTypeId: toNullable(String(formData.get("projectTypeId") ?? "")),
      contractTypeId: toNullable(String(formData.get("contractTypeId") ?? "")),
      isActive: formData.get("isActive") === "on",
    },
  });
  await audit("costsheet_template", templateId, "UPDATE");

  revalidatePath("/settings/costsheet-templates");
  revalidatePath(`/settings/costsheet-templates/${templateId}`);
  return {};
}

// ─────────────────────────────────────────────────────────
// Section
// ─────────────────────────────────────────────────────────

export async function createSection(templateId: string, formData: FormData) {
  const nameVi = String(formData.get("nameVi") ?? "").trim();
  if (!nameVi) return;

  const count = await prisma.costsheetTemplateSection.count({ where: { templateId } });
  const isProxy = formData.get("isProxy") === "on";
  await prisma.costsheetTemplateSection.create({
    data: {
      templateId,
      code: toNullable(String(formData.get("code") ?? "")) ?? `SECTION_${count + 1}`,
      icon: toNullable(String(formData.get("icon") ?? "")),
      nameVi,
      nameEn: toNullable(String(formData.get("nameEn") ?? "")),
      colorSlot: String(formData.get("colorSlot") ?? "neutral"),
      sort: count,
      isProxy,
      proxyFeeType: isProxy ? String(formData.get("proxyFeeType") ?? "PCT") : null,
      proxyFeeVal: isProxy ? Number(formData.get("proxyFeeVal") ?? 0) || 0 : null,
    },
  });
  await audit("costsheet_template_section", templateId, "CREATE");
  revalidatePath(`/settings/costsheet-templates/${templateId}`);
}

export async function updateSection(templateId: string, sectionId: string, formData: FormData) {
  const nameVi = String(formData.get("nameVi") ?? "").trim();
  if (!nameVi) return;
  const isProxy = formData.get("isProxy") === "on";

  await prisma.costsheetTemplateSection.update({
    where: { id: sectionId },
    data: {
      code: String(formData.get("code") ?? "").trim() || "SECTION",
      icon: toNullable(String(formData.get("icon") ?? "")),
      nameVi,
      nameEn: toNullable(String(formData.get("nameEn") ?? "")),
      colorSlot: String(formData.get("colorSlot") ?? "neutral"),
      isProxy,
      proxyFeeType: isProxy ? String(formData.get("proxyFeeType") ?? "PCT") : null,
      proxyFeeVal: isProxy ? Number(formData.get("proxyFeeVal") ?? 0) || 0 : null,
    },
  });
  await audit("costsheet_template_section", sectionId, "UPDATE");
  revalidatePath(`/settings/costsheet-templates/${templateId}`);
}

export async function deleteSection(templateId: string, sectionId: string) {
  await prisma.costsheetTemplateSection.delete({ where: { id: sectionId } });
  await audit("costsheet_template_section", sectionId, "DELETE");
  revalidatePath(`/settings/costsheet-templates/${templateId}`);
}

export async function moveSection(templateId: string, sectionId: string, direction: "up" | "down") {
  const sections = await prisma.costsheetTemplateSection.findMany({ where: { templateId }, orderBy: { sort: "asc" } });
  const idx = sections.findIndex((s) => s.id === sectionId);
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= sections.length) return;

  await prisma.$transaction([
    prisma.costsheetTemplateSection.update({ where: { id: sections[idx].id }, data: { sort: sections[swapWith].sort } }),
    prisma.costsheetTemplateSection.update({ where: { id: sections[swapWith].id }, data: { sort: sections[idx].sort } }),
  ]);
  revalidatePath(`/settings/costsheet-templates/${templateId}`);
}

// ─────────────────────────────────────────────────────────
// Line
// ─────────────────────────────────────────────────────────

export async function createLine(templateId: string, sectionId: string, formData: FormData) {
  const itemName = String(formData.get("itemName") ?? "").trim();
  if (!itemName) return;

  const count = await prisma.costsheetTemplateLine.count({ where: { sectionId } });
  const lineType = String(formData.get("lineType") ?? "QTY_PRICE");
  const maxMarkupRaw = String(formData.get("maxMarkupPct") ?? "").trim();

  await prisma.costsheetTemplateLine.create({
    data: {
      sectionId,
      itemName,
      lineType,
      defaultQty: Number(formData.get("defaultQty") ?? 1) || 1,
      defaultUnit: toNullable(String(formData.get("defaultUnit") ?? "")),
      defaultUnitPrice: BigInt(Math.round(Number(formData.get("defaultUnitPrice") ?? 0) || 0)),
      fixedAmount: lineType === "FIXED" ? BigInt(Math.round(Number(formData.get("fixedAmount") ?? 0) || 0)) : null,
      percentVal: lineType === "PERCENT_OF_TOTAL" ? Number(formData.get("percentVal") ?? 0) || 0 : null,
      isLocked: formData.get("isLocked") === "on",
      maxMarkupPct: maxMarkupRaw === "" ? null : Number(maxMarkupRaw) || 0,
      sort: count,
    },
  });
  revalidatePath(`/settings/costsheet-templates/${templateId}`);
}

export async function updateLine(templateId: string, lineId: string, formData: FormData) {
  const itemName = String(formData.get("itemName") ?? "").trim();
  if (!itemName) return;
  const lineType = String(formData.get("lineType") ?? "QTY_PRICE");
  const maxMarkupRaw = String(formData.get("maxMarkupPct") ?? "").trim();

  await prisma.costsheetTemplateLine.update({
    where: { id: lineId },
    data: {
      itemName,
      lineType,
      defaultQty: Number(formData.get("defaultQty") ?? 1) || 1,
      defaultUnit: toNullable(String(formData.get("defaultUnit") ?? "")),
      defaultUnitPrice: BigInt(Math.round(Number(formData.get("defaultUnitPrice") ?? 0) || 0)),
      fixedAmount: lineType === "FIXED" ? BigInt(Math.round(Number(formData.get("fixedAmount") ?? 0) || 0)) : null,
      percentVal: lineType === "PERCENT_OF_TOTAL" ? Number(formData.get("percentVal") ?? 0) || 0 : null,
      isLocked: formData.get("isLocked") === "on",
      maxMarkupPct: maxMarkupRaw === "" ? null : Number(maxMarkupRaw) || 0,
    },
  });
  revalidatePath(`/settings/costsheet-templates/${templateId}`);
}

export async function deleteLine(templateId: string, lineId: string) {
  await prisma.costsheetTemplateLine.delete({ where: { id: lineId } });
  revalidatePath(`/settings/costsheet-templates/${templateId}`);
}
