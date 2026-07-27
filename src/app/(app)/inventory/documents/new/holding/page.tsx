import { getTranslations } from "next-intl/server";
import { HoldingForm } from "../../holding-form";
import { loadDocFormData } from "../load";
import { requirePermission } from "@/lib/permissions";

/** Chuyển đồ hiện trường giữa 2 dự án (K4) — 2 bước, bên nhận xác nhận mới cộng holding. */
export default async function NewHoldingPage() {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.documents");
  const { projectOptions, projectsWithHoldings, holdingsByProject } = await loadDocFormData();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newHolding")}</h1>
      <HoldingForm projects={projectOptions} projectsWithHoldings={projectsWithHoldings} holdingsByProject={holdingsByProject} />
    </div>
  );
}
