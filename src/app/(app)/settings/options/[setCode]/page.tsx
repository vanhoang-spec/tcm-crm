import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { OptionItemList } from "./option-item-list";
import { OptionItemCreateForm } from "./option-item-create-form";

export default async function SettingsOptionsPage({ params }: { params: Promise<{ setCode: string }> }) {
  const { setCode } = await params;

  const set = await prisma.optionSet.findUnique({
    where: { code: setCode },
    include: { items: { orderBy: { sort: "asc" } } },
  });
  if (!set) notFound();

  const [t, tIndex] = await Promise.all([
    getTranslations("settings.options"),
    getTranslations("settings.index"),
  ]);
  // Map setCode → tiêu đề đã dịch; danh mục lạ rơi về tên gốc trong DB.
  const titleMap: Record<string, string> = {
    industry: tIndex("industryTitle"),
    project_type: tIndex("projectTypeTitle"),
    contract_type: tIndex("contractTypeTitle"),
    fail_reason: tIndex("failReasonTitle"),
    channel: tIndex("channelTitle"),
    client_status: tIndex("clientStatusTitle"),
    client_classification: tIndex("clientClassificationTitle"),
    complexity: tIndex("complexityTitle"),
    project_status: tIndex("projectStatusTitle"),
    timeline_status: tIndex("timelineStatusTitle"),
    creative_task_type: tIndex("creativeTaskTypeTitle"),
    kb_category: tIndex("kbCategoryTitle"),
    inventory_category: tIndex("inventoryCategoryTitle"),
    leave_type: tIndex("leaveTypeTitle"),
  };
  const title = titleMap[setCode] ?? set.name;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title", { name: title })}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <div className="space-y-3">
        <OptionItemList key={set.items.map((i) => i.id).join(",")} setCode={setCode} items={set.items} />
        <OptionItemCreateForm setCode={setCode} />
      </div>
    </div>
  );
}
