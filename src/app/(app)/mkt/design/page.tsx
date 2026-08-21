import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { getCurrentStaffId } from "@/lib/current-staff";
import { formatDate } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { DesignBoard, type DesignOrderView } from "./design-board";

/**
 * MKT-3 — YÊU CẦU THIẾT KẾ. Xem: `mkt.view` (designer không cần mã quyền riêng — phạm vi do câu
 * truy vấn và phép kiểm theo bản ghi quyết định, xem design/actions.ts).
 *
 * Sắp xếp: việc CHƯA ai nhận lên trước, rồi tới hạn gần nhất — designer mở trang là thấy ngay việc
 * cần làm, không phải lọc.
 */
export default async function MktDesignPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  await requirePermission("mkt.view");
  const { all } = await searchParams;
  const showAll = all === "1";

  const [t, locale, meId, canReview, rows] = await Promise.all([
    getTranslations("mkt.design"),
    getLocale() as Promise<Locale>,
    getCurrentStaffId(),
    hasPermission("mkt.review"),
    prisma.mktDesignOrder.findMany({
      where: showAll ? {} : { status: { in: ["NEW", "IN_PROGRESS"] } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
      take: 100,
      select: {
        id: true,
        postId: true,
        brief: true,
        channels: true,
        dueDate: true,
        status: true,
        assigneeId: true,
        deliverableLinkUrl: true,
        designerNote: true,
        assignee: { select: { fullName: true } },
        post: { select: { title: true, _count: { select: { images: true } } } },
      },
    }),
  ]);

  const today = new Date();
  const orders: DesignOrderView[] = rows.map((o) => ({
    id: o.id,
    postId: o.postId,
    postTitle: o.post.title,
    brief: o.brief,
    channels: o.channels,
    dueDate: o.dueDate ? formatDate(o.dueDate) : null,
    overdue: !!o.dueDate && o.dueDate < today,
    status: o.status,
    assigneeId: o.assigneeId,
    assigneeName: o.assignee?.fullName ?? null,
    deliverableLinkUrl: o.deliverableLinkUrl,
    designerNote: o.designerNote,
    imageCount: o.post._count.images,
  }));

  const waiting = orders.filter((o) => o.status === "NEW").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("desc", { n: waiting })}</p>
        </div>
        <a
          href={showAll ? "/mkt/design" : "/mkt/design?all=1"}
          className="inline-flex h-8 items-center rounded-lg border border-border-strong px-2.5 text-xs font-medium hover:bg-surface-2"
        >
          {showAll ? t("showOpen") : t("showAll")}
        </a>
      </div>
      <DesignBoard orders={orders} meId={meId} canReview={canReview} />
      <p className="text-[11px] text-muted-foreground">{t("footnote", { today: formatDate(today) })}</p>
    </div>
  );
}
