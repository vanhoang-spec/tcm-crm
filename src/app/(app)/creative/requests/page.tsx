import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { formatDate, pickLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/locales";
import { RequestForm } from "./request-form";

/**
 * NHẬN VIỆC — đường vào của mọi task Creative ở bản mini.
 *
 * Gác `creative.view` (ai xem bảng task cũng xem được yêu cầu); riêng FORM gửi yêu cầu chỉ hiện
 * cho người có `creative.request.create`. Đây là đặc quyền THÊM, và server tự kiểm lại trong
 * action — ẩn form chỉ là trang trí.
 */
export default async function CreativeRequestsPage() {
  await requirePermission("creative.view");
  const [t, locale, canCreate] = await Promise.all([
    getTranslations("creativeRequest"),
    getLocale() as Promise<Locale>,
    hasPermission("creative.request.create"),
  ]);

  const [requests, projects, clients] = await Promise.all([
    prisma.creativeRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        project: { select: { code: true, name: true, client: { select: { name: true } } } },
        requestedBy: { select: { fullName: true } },
        tasks: {
          select: { id: true, title: true, status: true, squad: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.project.findMany({
      where: { status: { code: { notIn: ["CANCELED"] } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {canCreate && (
        <RequestForm
          projects={projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }))}
          clients={clients.map((c) => ({ id: c.id, label: c.name }))}
        />
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">{t("listTitle")}</h2>
        {requests.length === 0 && <p className="text-sm text-muted-foreground">{t("listEmpty")}</p>}

        {requests.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{r.project.code}</span>
              <span className="text-sm font-medium text-foreground">{r.project.name}</span>
              {r.project.client?.name && <Badge tone="neutral">{r.project.client.name}</Badge>}
              <span className="text-xs text-muted-foreground">
                {t("deadlineIs", { date: formatDate(r.deadline) })}
                {r.requestedBy ? ` · ${t("byWhom", { name: r.requestedBy.fullName })}` : ""}
                {` · ${formatDate(r.createdAt)}`}
              </span>
              {r.briefLinkUrl && (
                <a
                  href={r.briefLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-xs font-medium text-brand-600 hover:underline"
                >
                  {t("openBrief")}
                </a>
              )}
            </div>

            {r.note && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{r.note}</p>}

            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
              {r.tasks.length === 0 ? (
                <span className="text-xs text-muted-foreground">{t("noTaskSpawned")}</span>
              ) : (
                r.tasks.map((task) => (
                  <span
                    key={task.id}
                    className="inline-flex items-center gap-1 rounded-full border border-border-strong px-2 py-0.5 text-[11px] text-foreground"
                  >
                    {task.title}
                    {task.squad?.name && <span className="text-muted-foreground">· {task.squad.name}</span>}
                  </span>
                ))
              )}
              <Link href="/creative" className="ml-auto text-xs font-medium text-brand-600 hover:underline">
                {t("goToBoard")}
              </Link>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
