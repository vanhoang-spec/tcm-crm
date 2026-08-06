import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { requirePermission } from "@/lib/permissions";
import { getCreativeOverdueTasks } from "@/lib/reminders";

/**
 * Nhắc việc — bản mini chỉ còn MỘT mục: task Creative quá hạn.
 *
 * Bản TCM đầy đủ gom 9 nguồn nhắc (chăm sóc khách, hạn thầu, duyệt CO/CE, timeline, ký nghiệm thu,
 * task bộ phận, trả đồ kho, hạn dùng vật tư, công nợ) — tất cả đã cắt cùng module tương ứng.
 */
export default async function RemindersPage() {
  await requirePermission("creative.view");
  const [t, overdue] = await Promise.all([getTranslations("reminders"), getCreativeOverdueTasks()]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">
          {t("creativeSection")} · {overdue.length}
        </h2>

        {overdue.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("creativeEmpty")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {overdue.map((task) => (
              <li key={task.taskId} className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 p-3">
                <span className="text-sm font-medium text-foreground">{task.title}</span>
                {task.squadName && <Badge tone="brand">{task.squadName}</Badge>}
                <Badge tone="danger">{t("creativeItem", { title: "", days: task.daysOverdue }).trim()}</Badge>
                <span className="text-xs text-muted-foreground">
                  {task.projectCode} · {task.projectName} · {formatDate(task.deadline)}
                </span>
                <Link href="/creative" className="ml-auto text-xs font-medium text-brand-600 hover:underline">
                  /creative
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
