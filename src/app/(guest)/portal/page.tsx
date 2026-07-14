import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, pickLabel } from "@/lib/utils";
import { CLIENT_TIMELINE_STATUSES } from "@/lib/projects";
import { getGuestSession } from "@/lib/guest-session";
import type { Locale } from "@/i18n/locales";
import { guestUpdateItem, guestAddComment, guestLogout } from "./actions";

export default async function GuestPortalPage() {
  const [t, locale, session] = await Promise.all([
    getTranslations("guest"),
    getLocale() as Promise<Locale>,
    getGuestSession(),
  ]);

  if (!session) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <h1 className="text-lg font-bold text-foreground">{t("invalidTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("invalidBody")}</p>
      </div>
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: session.projectId },
    include: {
      client: true,
      timelineItems: {
        where: { isShared: true, externalPublished: true },
        include: { status: true, comments: { include: { authorStaff: true }, orderBy: { createdAt: "asc" } } },
        orderBy: { sort: "asc" },
      },
    },
  });
  if (!project) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <h1 className="text-lg font-bold text-foreground">{t("invalidTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("invalidBody")}</p>
      </div>
    );
  }

  const items = project.timelineItems;
  const publishedIds = new Set(items.map((i) => i.id));
  const topLevel = items.filter((i) => i.parentId === null || !publishedIds.has(i.parentId));
  const childrenOf = (id: string) => items.filter((i) => i.parentId === id);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t("portalTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("welcome", { name: session.guestName })}</p>
          <p className="mt-1 text-sm text-foreground">
            {t("projectLabel")}: <span className="font-medium">{project.name}</span> · {project.client.name}
          </p>
        </div>
        <form action={guestLogout}>
          <button type="submit" className="rounded-lg border border-border-strong px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-2">
            ✕
          </button>
        </form>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("timelineTitle")}</h2>
        <div className="mt-3 space-y-3">
          {topLevel.length === 0 && <p className="text-sm text-muted-foreground">{t("noItems")}</p>}
          {topLevel.map((item) => (
            <div key={item.id}>
              <ExternalItem item={item} t={t} locale={locale} />
              {childrenOf(item.id).length > 0 && (
                <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
                  {childrenOf(item.id).map((child) => (
                    <ExternalItem key={child.id} item={child} t={t} locale={locale} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

type ItemWithRels = {
  id: string;
  title: string;
  externalTitle: string | null;
  startDate: Date | null;
  endDate: Date | null;
  externalStartDate: Date | null;
  externalEndDate: Date | null;
  clientEditable: boolean;
  clientStatus: string | null;
  clientNote: string | null;
  status: { labelVi: string; labelEn: string | null } | null;
  comments: { id: string; body: string; authorType: string; authorStaff: { fullName: string } | null; createdAt: Date }[];
};

function ExternalItem({
  item,
  t,
  locale,
}: {
  item: ItemWithRels;
  t: Awaited<ReturnType<typeof getTranslations<"guest">>>;
  locale: Locale;
}) {
  const title = item.externalTitle ?? item.title;
  const start = item.externalStartDate ?? item.startDate;
  const end = item.externalEndDate ?? item.endDate;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {item.status && <Badge tone="neutral">{pickLabel(item.status, locale)}</Badge>}
        {item.clientEditable ? <Badge tone="brand">{t("editableBadge")}</Badge> : <Badge tone="neutral">{t("viewOnlyBadge")}</Badge>}
      </div>
      {start && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("start")}: {formatDate(start)}
          {end ? ` · ${t("end")}: ${formatDate(end)}` : ""}
        </p>
      )}

      {item.clientEditable ? (
        <form action={guestUpdateItem.bind(null, item.id)} className="mt-2 space-y-2">
          <label className="block text-xs font-medium text-foreground">
            {t("clientStatusLabel")}
            <select
              name="clientStatus"
              defaultValue={item.clientStatus ?? "PENDING"}
              className="mt-1 h-8 w-full rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 sm:w-56"
            >
              {CLIENT_TIMELINE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`clientStatus${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-foreground">
            {t("clientNoteLabel")}
            <textarea
              name="clientNote"
              defaultValue={item.clientNote ?? ""}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand-400"
            />
          </label>
          <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
            {t("save")}
          </button>
        </form>
      ) : (
        item.clientStatus && (
          <p className="mt-1 text-xs text-brand-700">
            {t("clientStatusLabel")}: {t(`clientStatus${item.clientStatus}`)}
          </p>
        )
      )}

      {/* Comments */}
      <div className="mt-3 border-t border-border pt-2">
        <p className="text-xs font-semibold text-muted-foreground">{t("comments")}</p>
        <ul className="mt-1 space-y-1">
          {item.comments.map((c) => (
            <li key={c.id} className="text-xs">
              <span className="font-medium text-foreground">
                {c.authorType === "GUEST" ? "★" : c.authorStaff?.fullName ?? "TCM"}
              </span>{" "}
              <span className="text-muted-foreground">{formatDateTime(c.createdAt, locale)}</span>
              <p className="text-foreground">{c.body}</p>
            </li>
          ))}
        </ul>
        <form action={guestAddComment.bind(null, item.id)} className="mt-1 flex items-end gap-2">
          <input
            name="body"
            placeholder={t("commentPlaceholder")}
            className="h-8 flex-1 rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400"
            required
          />
          <button type="submit" className="h-8 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2">
            {t("addComment")}
          </button>
        </form>
      </div>
    </div>
  );
}
