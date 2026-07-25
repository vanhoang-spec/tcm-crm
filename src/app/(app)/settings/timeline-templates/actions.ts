"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";

export type TimelineTemplateFormState = { error?: string; fieldErrors?: Record<string, string> };

function toNullable(v: string) {
  return v.trim() === "" ? null : v.trim();
}
function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function audit(entityType: string, entityId: string, action: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType, entityId, field: "*", action, changedBy: staffId } });
}

// ── Template ──
export async function createTimelineTemplate(
  _prev: TimelineTemplateFormState,
  formData: FormData,
): Promise<TimelineTemplateFormState> {
  const t = await getTranslations("settings.timelineTemplates");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { fieldErrors: { name: t("errorNameRequired") } };

  const created = await prisma.timelineTemplate.create({
    data: {
      name,
      projectTypeId: toNullable(String(formData.get("projectTypeId") ?? "")),
      viewMode: String(formData.get("viewMode") ?? "GANTT"),
    },
  });
  await audit("timeline_template", created.id, "CREATE");
  revalidatePath("/settings/timeline-templates");
  redirect(`/settings/timeline-templates/${created.id}`);
}

export async function updateTimelineTemplate(
  templateId: string,
  _prev: TimelineTemplateFormState,
  formData: FormData,
): Promise<TimelineTemplateFormState> {
  const t = await getTranslations("settings.timelineTemplates");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { fieldErrors: { name: t("errorNameRequired") } };

  const columns = formData.getAll("col").map((c) => String(c));
  await prisma.timelineTemplate.update({
    where: { id: templateId },
    data: {
      name,
      projectTypeId: toNullable(String(formData.get("projectTypeId") ?? "")),
      viewMode: String(formData.get("viewMode") ?? "GANTT"),
      columnsJson: JSON.stringify(columns),
      isActive: formData.get("isActive") === "on",
    },
  });
  await audit("timeline_template", templateId, "UPDATE");
  revalidatePath("/settings/timeline-templates");
  revalidatePath(`/settings/timeline-templates/${templateId}`);
  return {};
}

// ── Section ──
export async function createTimelineSection(templateId: string, formData: FormData) {
  const nameVi = String(formData.get("nameVi") ?? "").trim();
  if (!nameVi) return;
  const count = await prisma.timelineTemplateSection.count({ where: { templateId } });
  await prisma.timelineTemplateSection.create({
    data: {
      templateId,
      code: toNullable(String(formData.get("code") ?? "")) ?? `SECTION_${count + 1}`,
      nameVi,
      nameEn: toNullable(String(formData.get("nameEn") ?? "")),
      sort: count,
    },
  });
  revalidatePath(`/settings/timeline-templates/${templateId}`);
}

export async function updateTimelineSection(templateId: string, sectionId: string, formData: FormData) {
  const nameVi = String(formData.get("nameVi") ?? "").trim();
  if (!nameVi) return;
  await prisma.timelineTemplateSection.update({
    where: { id: sectionId },
    data: {
      code: String(formData.get("code") ?? "").trim() || "SECTION",
      nameVi,
      nameEn: toNullable(String(formData.get("nameEn") ?? "")),
    },
  });
  revalidatePath(`/settings/timeline-templates/${templateId}`);
}

export async function deleteTimelineSection(templateId: string, sectionId: string) {
  await prisma.timelineTemplateSection.delete({ where: { id: sectionId } });
  revalidatePath(`/settings/timeline-templates/${templateId}`);
}

export async function moveTimelineSection(templateId: string, sectionId: string, direction: "up" | "down") {
  const sections = await prisma.timelineTemplateSection.findMany({ where: { templateId }, orderBy: { sort: "asc" } });
  const idx = sections.findIndex((s) => s.id === sectionId);
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= sections.length) return;
  await prisma.$transaction([
    prisma.timelineTemplateSection.update({ where: { id: sections[idx].id }, data: { sort: sections[swapWith].sort } }),
    prisma.timelineTemplateSection.update({ where: { id: sections[swapWith].id }, data: { sort: sections[idx].sort } }),
  ]);
  revalidatePath(`/settings/timeline-templates/${templateId}`);
}

// ── Item ──
export async function createTimelineTemplateItem(templateId: string, sectionId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const count = await prisma.timelineTemplateItem.count({ where: { sectionId } });
  await prisma.timelineTemplateItem.create({
    data: {
      sectionId,
      title,
      parentLabel: toNullable(String(formData.get("parentLabel") ?? "")),
      defaultDepartmentCode: toNullable(String(formData.get("defaultDepartmentCode") ?? "")),
      defaultDurationDays: numOrNull(formData.get("defaultDurationDays")),
      defaultUnit: toNullable(String(formData.get("defaultUnit") ?? "")),
      defaultQty: numOrNull(formData.get("defaultQty")),
      sort: count,
    },
  });
  revalidatePath(`/settings/timeline-templates/${templateId}`);
}

export async function updateTimelineTemplateItem(templateId: string, itemId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await prisma.timelineTemplateItem.update({
    where: { id: itemId },
    data: {
      title,
      parentLabel: toNullable(String(formData.get("parentLabel") ?? "")),
      defaultDepartmentCode: toNullable(String(formData.get("defaultDepartmentCode") ?? "")),
      defaultDurationDays: numOrNull(formData.get("defaultDurationDays")),
      defaultUnit: toNullable(String(formData.get("defaultUnit") ?? "")),
      defaultQty: numOrNull(formData.get("defaultQty")),
    },
  });
  revalidatePath(`/settings/timeline-templates/${templateId}`);
}

export async function deleteTimelineTemplateItem(templateId: string, itemId: string) {
  await prisma.timelineTemplateItem.delete({ where: { id: itemId } });
  revalidatePath(`/settings/timeline-templates/${templateId}`);
}
