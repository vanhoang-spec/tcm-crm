import { TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function ConcentrationBanner() {
  const t = await getTranslations("clients.concentration");

  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div>
        <span className="font-medium text-foreground">{t("title")}</span>{" "}
        <span className="text-muted-foreground">{t("desc")}</span>
      </div>
    </div>
  );
}
