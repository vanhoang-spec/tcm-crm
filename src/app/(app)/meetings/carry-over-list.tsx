"use client";

import { useTranslations } from "next-intl";
import { setActionStatus } from "./actions";

/**
 * VIỆC TỒN — việc còn OPEN sinh ra ở các tuần TRƯỚC của cùng team. Không copy sang tuần mới (việc thuộc
 * tuần sinh ra nó); ở đây chỉ đánh dấu xong. Đánh dấu được kể cả khi biên bản tuần gốc đã chốt.
 */
export function CarryOverList({
  items,
  viewMeetingId,
  canWrite,
}: {
  items: { id: string; title: string; assignee: string | null; dueDate: string | null; fromWeek: string; ref: string | null }[];
  viewMeetingId: string | null;
  canWrite: boolean;
}) {
  const t = useTranslations("meetings");
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-warning/30 bg-warning-bg/40 p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("carryTitle", { n: items.length })}</h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{t("carryHint")}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
            {canWrite ? (
              <form action={setActionStatus.bind(null, a.id, "DONE", viewMeetingId)}>
                <button type="submit" className="h-6 rounded border border-border-strong bg-surface px-2 text-[11px] hover:bg-surface-2">
                  {t("markDone")}
                </button>
              </form>
            ) : (
              <span className="text-muted-foreground">•</span>
            )}
            <span className="font-medium text-foreground">{a.title}</span>
            <span className={a.assignee ? "text-muted-foreground" : "text-warning"}>— {a.assignee ?? t("unassigned")}</span>
            {a.ref && <span className="rounded bg-surface-2 px-1.5 text-[10px] text-muted-foreground">{a.ref}</span>}
            {a.dueDate && <span className="text-muted-foreground">· {t("due", { date: a.dueDate })}</span>}
            <span className="text-[11px] text-muted-foreground">· {t("fromWeek", { date: a.fromWeek })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
