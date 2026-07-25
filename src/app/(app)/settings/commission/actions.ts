"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";

export type SettingsFormState = { error?: string; success?: boolean };

export async function updateCommissionScheme(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requirePermission("settings.commission.manage");
  const t = await getTranslations("settings.commission");
  const baseCommissionAmount = Number(formData.get("baseCommissionAmount") ?? 0);
  const contractCommissionAmount = Number(formData.get("contractCommissionAmount") ?? 0);
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isFinite(baseCommissionAmount) || baseCommissionAmount < 0) {
    return { error: t("errorBaseInvalid") };
  }
  if (!Number.isFinite(contractCommissionAmount) || contractCommissionAmount < 0) {
    return { error: t("errorContractInvalid") };
  }

  const staffId = await getCurrentStaffId();
  const before = await prisma.commissionScheme.findUnique({ where: { code: "default" } });

  await prisma.commissionScheme.upsert({
    where: { code: "default" },
    update: { baseCommissionAmount, contractCommissionAmount, note: note || null, updatedBy: staffId },
    create: {
      code: "default",
      baseCommissionAmount,
      contractCommissionAmount,
      note: note || null,
      updatedBy: staffId,
    },
  });

  if (before && (before.baseCommissionAmount !== baseCommissionAmount || before.contractCommissionAmount !== contractCommissionAmount)) {
    await prisma.auditLog.create({
      data: {
        entityType: "commission_scheme",
        entityId: "default",
        field: "amounts",
        oldValue: JSON.stringify({ base: before.baseCommissionAmount, contract: before.contractCommissionAmount }),
        newValue: JSON.stringify({ base: baseCommissionAmount, contract: contractCommissionAmount }),
        action: "UPDATE",
        changedBy: staffId,
      },
    });
  }

  revalidatePath("/settings/commission");
  return { success: true };
}
