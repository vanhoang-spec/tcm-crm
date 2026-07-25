import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { ORDER_DEPARTMENT_LABELS } from "@/lib/bidding";
import { OrderReview, type OrderData } from "./order-review";
import { requirePermission } from "@/lib/permissions";

export default async function ProjectOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.view");
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) notFound();

  const [t, orders] = await Promise.all([
    getTranslations("projects.orders"),
    prisma.projectOrder.findMany({
      where: { projectId: id, department: { not: "BRAINSTORM" } },
      include: { sentBy: true, items: { orderBy: { sort: "asc" } } },
      orderBy: { department: "asc" },
    }),
  ]);

  const orderData: OrderData[] = orders.map((o) => ({
    id: o.id,
    department: o.department,
    deptLabel: ORDER_DEPARTMENT_LABELS[o.department] ?? o.department,
    isDraft: o.isDraft,
    status: o.status,
    sentByName: o.sentBy?.fullName ?? null,
    items: o.items.map((it) => ({
      id: it.id,
      label: it.label,
      detail: it.detail,
      desiredReceiptAt: it.desiredReceiptAt,
      status: it.status,
      fromTimeline: it.sourceTimelineItemId != null,
    })),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>
      <OrderReview projectId={id} orders={orderData} />
    </div>
  );
}
