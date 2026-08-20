import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { getMyPermissions, requirePermission } from "@/lib/permissions";
import { getPurchasingScope, canUseGroup } from "@/lib/purchasing-scope";
import { resolveRfqTemplate, parseExtraJson } from "@/lib/rfq-templates";
import { formatDate, formatNumber, toNum } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { RfqDetail, type RfqDetailData } from "./rfq-detail";
import { CompareBlock } from "./compare-block";
import { loadCompareMatrix, canConfirmRfq } from "@/lib/rfq-server";
import { parseSelection } from "@/lib/rfq-compare";
import { rfqCompareSchema } from "@/lib/ai/rfq-prompts";

const STATUS_TONE: Record<string, "neutral" | "warning" | "brand" | "success" | "danger"> = {
  DRAFT: "neutral",
  SENT: "warning",
  COMPARING: "brand",
  SUBMITTED: "brand",
  CONFIRMED: "success",
  CANCELED: "danger",
};

/** Chi tiết RFQ: dòng hỏi giá · từng NCC (link cổng, nhập hộ, upload+AI, báo giá đã lưu). Gác `purchasing.view`; nút sửa theo `purchasing.rfq.manage`. */
export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("purchasing.view");
  const perms = await getMyPermissions();
  const { id } = await params;
  const [t, locale, rfq] = await Promise.all([
    getTranslations("purchasing.rfq"),
    getLocale() as Promise<Locale>,
    prisma.rfq.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, code: true, name: true } },
        createdBy: { select: { fullName: true } },
        departmentTask: { select: { id: true, title: true } },
        lines: { orderBy: { sort: "asc" } },
        vendors: {
          orderBy: { createdAt: "asc" },
          include: { vendor: { select: { id: true, name: true, code: true } }, quoteLines: true },
        },
      },
    }),
  ]);
  if (!rfq) notFound();
  // RFQ thuộc nhóm chưa chia sẻ ⇒ coi như không tồn tại.
  if (!canUseGroup(await getPurchasingScope(), rfq.groupCode)) notFound();
  const template = resolveRfqTemplate(rfq.groupCode);
  if (!template) notFound();

  const data: RfqDetailData = {
    id: rfq.id,
    code: rfq.code,
    title: rfq.title,
    status: rfq.status,
    note: rfq.note,
    deadline: rfq.deadline ? rfq.deadline.toISOString() : null,
    templateCode: template.code,
    lines: rfq.lines.map((l) => ({ id: l.id, itemName: l.itemName, specs: l.specs, unit: l.unit, quantity: l.quantity, refUnitPrice: l.refUnitPrice == null ? null : toNum(l.refUnitPrice) })),
    vendors: rfq.vendors.map((rv) => ({
      id: rv.id,
      vendorId: rv.vendor.id,
      vendorName: rv.vendor.name,
      vendorCode: rv.vendor.code,
      status: rv.status,
      submittedAt: rv.submittedAt ? rv.submittedAt.toISOString() : null,
      submittedVia: rv.submittedVia,
      hasToken: !!rv.tokenHash && !rv.revokedAt,
      tokenExpiresAt: rv.tokenExpiresAt ? rv.tokenExpiresAt.toISOString() : null,
      fileName: rv.fileName,
      hasFile: !!rv.fileKey,
      terms: rv.termsJson ? parseExtraJson(rv.termsJson) : {},
      note: rv.note,
      quoteLines: rv.quoteLines.map((q) => ({ rfqLineId: q.rfqLineId, unitPrice: toNum(q.unitPrice), quantity: q.quantity, amount: toNum(q.amount), extra: parseExtraJson(q.extraJson), note: q.note })),
    })),
  };
  const canManage = perms.has("purchasing.rfq.manage");
  const canAi = perms.has("purchasing.rfq.ai");
  // Chốt vào CO: theo BẢN GHI (PIC/Leader dự án + costsheet.edit, hoặc người duyệt CO) — kiểm ở đây
  // chỉ để hiện/ẩn nút; action kiểm lại bằng cùng hàm canConfirmRfq.
  const canConfirm = await canConfirmRfq(rfq.project.id);
  const matrix = await loadCompareMatrix(rfq.id);
  const aiParsed = rfq.aiJson ? rfqCompareSchema.safeParse(JSON.parse(rfq.aiJson)) : null;
  const ai = aiParsed && aiParsed.success ? aiParsed.data : null;
  const selection = parseSelection(rfq.finalJson);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/purchasing" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("backToList")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            <span className="font-mono text-base text-muted-foreground">{rfq.code}</span> · {rfq.title}
          </h1>
          <Badge tone={STATUS_TONE[rfq.status] ?? "neutral"}>{t(`status${rfq.status}`)}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("detailProject")}: <span className="font-mono">{rfq.project.code}</span> {rfq.project.name} · {t("detailGroup")}: {locale === "en" ? template.labelEn : template.labelVi} ·{" "}
          {t("detailDeadline")}: {rfq.deadline ? formatDate(rfq.deadline) : "—"} · {t("detailCreatedBy")}: {rfq.createdBy?.fullName ?? "—"}
          {rfq.departmentTask && (
            <>
              {" "}
              · {t("detailTask")}:{" "}
              <Link href={`/projects/${rfq.project.id}/purchasing`} className="text-brand-600 hover:underline">
                {rfq.departmentTask.title}
              </Link>
            </>
          )}
        </p>
        {rfq.note && <p className="mt-1 text-xs text-muted-foreground">{rfq.note}</p>}
      </div>

      {/* Dòng hỏi giá — bảng đọc, có đơn giá CO tham chiếu (trước thuế) */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("linesSectionTitle")}</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3">#</th>
                <th className="py-1.5 pr-3">{t("colLine")}</th>
                <th className="py-1.5 pr-3">{t("colSpecs")}</th>
                <th className="py-1.5 pr-3 text-right">{t("colQty")}</th>
                <th className="py-1.5 pr-3">{t("colUnit")}</th>
                <th className="py-1.5 pr-3 text-right">{t("colRefPrice")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.lines.map((l, i) => (
                <tr key={l.id}>
                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 pr-3 text-foreground">{l.itemName}</td>
                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">{l.specs ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(l.quantity, locale)}</td>
                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">{l.unit ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{l.refUnitPrice == null ? "—" : formatNumber(l.refUnitPrice, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <RfqDetail data={data} canManage={canManage} canAi={canAi} locale={locale} />

      {matrix && (
        <CompareBlock
          rfqId={rfq.id}
          status={rfq.status}
          matrix={matrix}
          ai={ai}
          selection={selection}
          canManage={canManage}
          canAi={canAi}
          canConfirm={canConfirm}
          appliedRevNo={rfq.appliedRevNo}
          projectId={rfq.project.id}
          locale={locale}
        />
      )}
    </div>
  );
}
