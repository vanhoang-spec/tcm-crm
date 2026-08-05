"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";

export type SettingsFormState = { error?: string };

export async function createTeam(_prevState: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  await requirePermission("settings.teams.manage");
  const t = await getTranslations("settings.teams");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) return { error: t("errorRequired") };

  const existing = await prisma.team.findUnique({ where: { code } });
  if (existing) return { error: t("errorCodeExists", { code }) };

  const staffId = await getCurrentStaffId();
  const team = await prisma.team.create({ data: { code, name } });
  await prisma.auditLog.create({
    data: {
      entityType: "team",
      entityId: team.id,
      field: "*",
      newValue: JSON.stringify({ code, name }),
      action: "CREATE",
      changedBy: staffId,
    },
  });

  revalidatePath("/settings/teams");
  return {};
}

export async function updateTeam(
  teamId: string,
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requirePermission("settings.teams.manage");
  const t = await getTranslations("settings.teams");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const isActive = formData.get("isActive") === "on";
  const leadRaw = String(formData.get("leadStaffId") ?? "").trim();
  if (!code || !name) return { error: t("errorRequired") };

  const duplicate = await prisma.team.findFirst({ where: { code, NOT: { id: teamId } } });
  if (duplicate) return { error: t("errorCodeExists", { code }) };

  const before = await prisma.team.findUnique({ where: { id: teamId } });
  if (!before) return { error: t("errorNotFound") };

  // Trưởng team phải là người ĐANG LÀM VIỆC và THUỘC CHÍNH TEAM ĐÓ. Không kiểm thì gán nhầm người
  // team khác làm trưởng, và luồng duyệt mượn người sẽ hỏi sai người mà không ai thấy.
  let leadStaffId: string | null = null;
  if (leadRaw) {
    const lead = await prisma.staff.findFirst({ where: { id: leadRaw, teamId, isActive: true }, select: { id: true } });
    if (!lead) return { error: t("errorLeadNotInTeam") };
    leadStaffId = lead.id;
  }

  const staffId = await getCurrentStaffId();
  await prisma.team.update({ where: { id: teamId }, data: { code, name, isActive, leadStaffId } });

  const changed: string[] = [];
  if (before.code !== code) changed.push("code");
  if (before.name !== name) changed.push("name");
  if (before.isActive !== isActive) changed.push("isActive");
  if ((before.leadStaffId ?? "") !== (leadStaffId ?? "")) changed.push("leadStaffId");
  if (changed.length > 0) {
    await prisma.auditLog.createMany({
      data: changed.map((field) => ({
        entityType: "team",
        entityId: teamId,
        field,
        oldValue: String(before[field as keyof typeof before] ?? ""),
        newValue:
          field === "code" ? code : field === "name" ? name : field === "leadStaffId" ? (leadStaffId ?? "") : String(isActive),
        action: "UPDATE",
        changedBy: staffId,
      })),
    });
  }

  revalidatePath("/settings/teams");
  revalidatePath("/clients");
  return {};
}
