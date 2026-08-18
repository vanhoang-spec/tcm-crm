import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getOrderStockLines } from "@/lib/inventory-order";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import { Badge } from "@/components/ui/badge";

/**
 * K6-3 — Khối "Vật dụng theo Order" trên tab Vận hành (OPE) / Sản xuất (PRO) của dự án: bộ phận nhận order
 * nắm ngay số lượng từng sản phẩm Account cần, tồn khả dụng chia theo CHỦ SỞ HỮU, và số đã đề xuất / đã xuất —
 * rồi bấm một nút sang form đề xuất xuất kho đã chọn sẵn dự án + kèm danh sách cần lấy.
 * Server component; không có order hoặc order không ghi vật dụng thì không hiện gì.
 */
export async function OrderStockLines({ projectId, department }: { projectId: string; department: "OPE" | "PRO" }) {
  const [order, project] = await Promise.all([
    prisma.projectOrder.findUnique({ where: { projectId_department: { projectId, department } }, select: { id: true, isDraft: true, status: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { status: { select: { code: true } } } }),
  ]);
  if (!order || order.isDraft) return null;
  // Đề xuất xuất kho chỉ mở cho dự án ĐANG THỰC THI (luật K2 ở createIssueRequest) — dự án còn đấu thầu thì bảng
  // vẫn hiện để OPS biết trước cần gì / có gì, nhưng KHÔNG mời bấm nút dẫn tới form không chọn được dự án.
  const canRequest = !!project && (EXECUTION_STATUS_CODES as readonly string[]).includes(project.status.code);
  const lines = await getOrderStockLines(order.id, projectId);
  if (lines.length === 0) return null;
  const t = await getTranslations("inventory.orderStock");

  return (
    <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canRequest ? (
          <Link
            href={`/inventory/requests/new/issue?projectId=${projectId}&orderId=${order.id}`}
            className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700"
          >
            {t("requestFromOrder")}
          </Link>
        ) : (
          <span className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] text-muted-foreground">{t("notExecutingYet")}</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-1.5 pr-3 font-medium">{t("colProduct")}</th>
              <th className="py-1.5 pr-3 text-right font-medium">{t("colNeed")}</th>
              <th className="py-1.5 pr-3 text-right font-medium">{t("colRequested")}</th>
              <th className="py-1.5 pr-3 text-right font-medium">{t("colIssued")}</th>
              <th className="py-1.5 pr-3 font-medium">{t("colAvailable")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const remaining = Math.max(0, l.quantity - l.requested - l.issued);
              const totalAvail = l.available.TCM + l.available.MINE + l.available.OTHER_PROJECT + l.available.CLIENT;
              return (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <span className="font-mono font-semibold text-foreground">{l.productCode}</span> <span className="text-foreground">{l.productName}</span>
                    {l.unit && <span className="text-muted-foreground"> · {l.unit}</span>}
                    {l.note && <span className="block text-[11px] text-muted-foreground">{l.note}</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold text-foreground">{l.quantity}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.requested}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.issued}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {l.available.TCM > 0 && <Badge tone="neutral">{t("availTCM", { n: l.available.TCM })}</Badge>}
                      {l.available.MINE > 0 && <Badge tone="success">{t("availMINE", { n: l.available.MINE })}</Badge>}
                      {l.available.OTHER_PROJECT > 0 && <Badge tone="warning">{t("availOTHER", { n: l.available.OTHER_PROJECT })}</Badge>}
                      {l.available.CLIENT > 0 && <Badge tone="brand">{t("availCLIENT", { n: l.available.CLIENT })}</Badge>}
                      {totalAvail === 0 && <span className="text-danger">{t("availNone")}</span>}
                      {remaining > 0 && totalAvail < remaining && <span className="text-[11px] text-danger">{t("shortfall", { n: remaining - totalAvail })}</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("ownerHint")}</p>
    </section>
  );
}
