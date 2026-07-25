import { getTranslations } from "next-intl/server";
import { CreativeNav } from "./creative-nav";

export default async function CreativeLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("creative.nav");
  const labels = { board: t("board"), cost: t("cost") };

  return (
    <div className="space-y-4">
      <CreativeNav labels={labels} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
