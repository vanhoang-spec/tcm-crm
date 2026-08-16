import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileSpreadsheet, Gavel, Printer } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getApprovedReservations } from "@/lib/stock-reservation";
import { formatNumber, formatPercent, formatDateTime, toNum } from "@/lib/utils";
import { computeMarginPct } from "@/lib/bidding";
import { getNumberSetting } from "@/lib/settings";
import type { Locale } from "@/i18n/locales";
import { CostSheetBuilder, type CostSheetData, type TemplateOption } from "../../../bidding/cost-sheet-builder";
import { ApproveCostSheetActions } from "../../../bidding/approve-costsheet-actions";
import { sendCostSheetToLiquidation } from "../../actions";
import { RevisionCompare, type RevisionData } from "./revision-compare";
import { ImportPanel, type ImportResultView } from "./import-panel";
import { matchSavedImport } from "@/lib/costsheet-import-server";
import { hasPermission, requirePermission } from "@/lib/permissions";

export default async function ProjectCoCePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ import?: string }>;
}) {
  await requirePermission("projects.view");
  const { id } = await params;
  const { import: importKey } = await searchParams;
  // Gắn vai trò cho bản snapshot là thao tác SỬA bảng CO/CE — dùng đúng mã quyền của builder.
  const canTagRevision = await hasPermission("bidding.costsheet.edit");
  // CE-2 — GATE CỘT theo quyền, quyết định TẠI SERVER: số bị gate không được vào HTML (bài học
  // KB-H2). PUR/OPE/PRO thấy diễn giải + CO trước thuế + trần chi; không thấy CE/Total CO/margin.
  const canViewCost = await hasPermission("bidding.costsheet.view_cost");
  const canViewPaycap = await hasPermission("bidding.costsheet.view_paycap");
  const canEditSheet = canTagRevision && canViewCost;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, projectTypeId: true, goNogoStatus: true },
  });
  if (!project) notFound();

  const [t, locale, minMargin, sheet, matchingTemplatesRaw, allTemplatesRaw, costDepartments, vendors, stockReservations] = await Promise.all([
    getTranslations("projects.coce"),
    getLocale() as Promise<Locale>,
    getNumberSetting("bidding", "min_margin_pct", 31),
    prisma.costSheet.findFirst({
      where: { projectId: id, version: "CTRACT" },
      orderBy: { createdAt: "desc" },
      include: {
        approvedBy: true,
        rejectedBy: true,
        sentToLiquidationBy: true,
        sentToLiquidationRevision: true,
        sections: { orderBy: { sort: "asc" }, include: { lines: { orderBy: { sort: "asc" } } } },
        revisions: { orderBy: { revNo: "desc" }, include: { createdBy: true } },
      },
    }),
    project.projectTypeId
      ? prisma.costsheetTemplate.findMany({
          where: { isActive: true, projectTypeId: project.projectTypeId },
          include: { sections: { orderBy: { sort: "asc" }, include: { lines: { orderBy: { sort: "asc" } } } } },
        })
      : Promise.resolve([]),
    prisma.costsheetTemplate.findMany({
      where: { isActive: true },
      include: { sections: { orderBy: { sort: "asc" }, include: { lines: { orderBy: { sort: "asc" } } } } },
    }),
    prisma.department.findMany({ where: { costPrefix: { not: null }, isActive: true }, select: { code: true, name: true, costPrefix: true }, orderBy: { code: "asc" } }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getApprovedReservations(id),
  ]);

  function toTemplateOption(tp: (typeof allTemplatesRaw)[number]): TemplateOption {
    return {
      id: tp.id,
      name: tp.name,
      sections: tp.sections.map((s) => ({
        id: s.id,
        parentId: null, // mẫu (template) luôn phẳng — N-cấp chỉ áp dụng cho CO/CE sống, xem cost-sheet-builder.tsx
        departmentCode: "", // mẫu không mang phòng ban — người dùng chọn sau khi dựng sheet
        code: s.code,
        icon: s.icon ?? "",
        nameVi: s.nameVi,
        nameEn: s.nameEn ?? "",
        colorSlot: s.colorSlot ?? "neutral",
        isProxy: s.isProxy,
        proxyFeeType: s.proxyFeeType,
        proxyFeeVal: s.proxyFeeVal,
        clientFeePct: null, // mẫu không mang phí báo khách — Account chọn mức khi dựng bảng thật
        lines: s.lines.map((l) => ({
          stableKey: "", // hydrate() ở builder sinh khoá khi nạp mẫu
          itemName: l.itemName,
          specs: l.defaultSpecs ?? "",
          lineType: l.lineType,
          quantity: l.defaultQty,
          unit: l.defaultUnit ?? "",
          unitPrice: toNum(l.defaultUnitPrice),
          fixedAmount: l.fixedAmount != null ? toNum(l.fixedAmount) : null,
          percentVal: l.percentVal,
          taxType: "VAT", // template không mang loại thuế — set khi dựng sheet thật
          customTaxAmount: null,
          vendorId: "",
          isLocked: l.isLocked,
          maxMarkupPct: l.maxMarkupPct == null ? "" : String(l.maxMarkupPct),
          isSponsored: false, // template không mang cờ tài trợ — tick khi dựng sheet thật
          stockResvLineId: null,
          stockRefUnitPrice: null,
          legCode: "", // template không mang nhãn chặng — gắn khi dựng bảng thật
          note: "",
          ceQuantity: null, // mẫu không mang CE — bảng dựng từ mẫu bắt đầu ở chế độ cũ
          ceUnitPrice: null,
          ceGroupKey: null,
          ceDropped: false,
          ceName: "",
          vatPct: null,
        })),
      })),
    };
  }
  const matchingTemplates = matchingTemplatesRaw.map(toTemplateOption);
  const allTemplates = allTemplatesRaw.map(toTemplateOption);

  const sheetData: CostSheetData | null = sheet
    ? {
        scenario: sheet.scenario,
        vatPct: sheet.vatPct,
        agencyFeePct: sheet.agencyFeePct,
        mgmtFeePct: sheet.mgmtFeePct,
        contingencyPct: sheet.contingencyPct,
        discountPct: sheet.discountPct,
        ceTotal: canViewCost ? toNum(sheet.ceTotal) : 0,
        templateId: sheet.templateId,
        approvedByName: sheet.approvedBy?.fullName ?? null,
        approvedAt: sheet.approvedAt ? formatDateTime(sheet.approvedAt, locale) : null,
        overrideNote: sheet.marginOverrideNote,
        sections: sheet.sections.map((s) => ({
          id: s.id,
          parentId: s.parentSectionId,
          code: s.code,
          icon: s.icon ?? "",
          nameVi: s.nameVi,
          nameEn: s.nameEn ?? "",
          colorSlot: s.colorSlot ?? "neutral",
          isProxy: s.isProxy,
          departmentCode: s.departmentCode ?? "",
          proxyFeeType: s.proxyFeeType,
          proxyFeeVal: s.proxyFeeVal,
          clientFeePct: s.clientFeePct,
          lines: s.lines.map((l) => ({
            stableKey: l.stableKey ?? "",
            itemName: l.itemName,
            specs: l.specs ?? "",
            lineType: l.lineType,
            quantity: l.quantity,
            unit: l.unit ?? "",
            unitPrice: toNum(l.unitPrice),
            fixedAmount: l.fixedAmount != null ? toNum(l.fixedAmount) : null,
            percentVal: l.percentVal,
            taxType: l.taxType,
            customTaxAmount: l.customTaxAmount != null ? toNum(l.customTaxAmount) : null,
            vendorId: l.vendorId ?? "",
            isLocked: l.isLocked,
            maxMarkupPct: l.maxMarkupPct == null ? "" : String(l.maxMarkupPct),
            isSponsored: l.isSponsored,
            stockResvLineId: l.stockResvLineId,
            stockRefUnitPrice: l.stockRefUnitPrice == null ? null : Number(l.stockRefUnitPrice),
            legCode: l.legCode ?? "",
            note: l.note ?? "",
            // Giá CE là số bị gate: KHÔNG select vào payload khi thiếu quyền (ceGroupKey/ceName
            // giữ lại vì chỉ là nhãn gộp, cần để lưu lại không làm mất nhóm).
            ceQuantity: canViewCost ? l.ceQuantity : null,
            ceUnitPrice: canViewCost && l.ceUnitPrice != null ? toNum(l.ceUnitPrice) : null,
            ceGroupKey: l.ceGroupKey,
            ceDropped: l.ceDropped,
            ceName: l.ceName ?? "",
            vatPct: l.vatPct,
          })),
        })),
      }
    : null;

  // CE-4 — có `?import=<key>` thì đọc lại file khách đã gửi và khớp với bảng hiện tại. Kết quả
  // THUẦN TRÌNH BÀY: không ghi gì, Account rà xong tự sửa trên builder rồi bấm Lưu.
  const importResult = canViewCost && importKey ? await matchSavedImport(id, importKey) : null;
  const importView: ImportResultView | null =
    importResult && importKey
      ? {
          fileKey: importKey,
          changed: importResult.changed.map((c) => ({
            stableKey: c.stableKey,
            name: c.name,
            fileName: c.fileName,
            matchedBy: c.matchedBy,
            beforeQty: c.before.qty,
            beforePrice: c.before.unitPrice,
            beforeAmount: c.before.amount,
            afterQty: c.after.qty,
            afterPrice: c.after.unitPrice,
            afterAmount: c.after.amount,
            direction: c.direction,
          })),
          unmatched: importResult.unmatchedInFile.map((u) => ({ name: u.name, amount: u.total, sheet: u.sheet, row: u.row })),
          missing: importResult.missingInFile.map((x) => ({ name: x.name, amount: x.ceAmount })),
        }
      : null;

  const hasAcceptanceRev = (sheet?.revisions ?? []).some((r) => r.kind === "ACCEPTANCE");
  const goNogoBlocked = project.goNogoStatus === "PENDING";
  // FIN-B: chờ duyệt = bản SỐNG chưa duyệt (chưa lần nào HOẶC vừa lưu phát sinh sau lần duyệt cuối).
  const latestRevNo = (sheet?.revisions ?? []).reduce((mx, r) => Math.max(mx, r.revNo), 0);
  const pendingApproval =
    !!sheet && latestRevNo > 0 && !sheet.rejectedAt && (sheet.approvedRevNo == null || sheet.approvedRevNo < latestRevNo);
  const sentRev = sheet?.sentToLiquidationRevision ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Xuất file — chỉ khi đã có bảng CO/CE. Route tự gác quyền bidding.view. */}
          {sheet && (
            <>
              <a href={`/api/costsheet/${id}/quotation?mode=client`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                <FileSpreadsheet className="h-3.5 w-3.5" /> {t("exportClientXlsx")}
              </a>
              {/* Bố cục nhiều sheet: mỗi mục lớn một sheet + sheet TỔNG HỢP — cùng một model số. */}
              <a href={`/api/costsheet/${id}/quotation?mode=client&layout=multi`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                <FileSpreadsheet className="h-3.5 w-3.5" /> {t("exportClientMulti")}
              </a>
              <a href={`/api/costsheet/${id}/quotation?mode=internal`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                <FileSpreadsheet className="h-3.5 w-3.5" /> {t("exportInternalXlsx")}
              </a>
              <Link href={`/projects/${id}/co-ce/print`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                <Printer className="h-3.5 w-3.5" /> {t("printView")}
              </Link>
            </>
          )}
          <Link
            href={`/bidding/${id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          >
            <Gavel className="h-3.5 w-3.5" /> {t("openBuilder")}
          </Link>
        </div>
      </div>

      {!sheet ? (
        <div className="rounded-xl border border-dashed border-border-strong p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("noSheet")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("noSheetHint")}</p>
        </div>
      ) : (
        <>
          {/* Sheet summary (bản sống realtime) — cả 4 ô đều là số bị gate bởi view_cost */}
          {canViewCost && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard label={t("coTotal")} value={formatNumber(sheet.coTotal, locale)} />
              <SummaryCard label={t("ceTotal")} value={formatNumber(sheet.ceTotal, locale)} />
              <SummaryCard label={t("chiHo")} value={formatNumber(sheet.chiHo, locale)} />
              <SummaryCard
                label={t("margin")}
                value={`${formatPercent(computeMarginPct(Number(sheet.ceTotal), Number(sheet.coTotal)), locale)}%`}
              />
            </div>
          )}

          {/* CO/CE builder — edit trực tiếp tại đây (dùng chung action với Bidding, cùng 1 CostSheet) */}
          <section className="rounded-xl border border-border bg-surface p-5">
            {pendingApproval && (
              <div className="mb-3">
                <ApproveCostSheetActions projectId={id} costSheetId={sheet.id} latestRevNo={latestRevNo} />
              </div>
            )}
            {goNogoBlocked ? (
              <p className="text-sm text-muted-foreground">{t("goNogoBlocked")}</p>
            ) : (
              <CostSheetBuilder
                departments={costDepartments.map((d) => ({ code: d.code, name: d.name, costPrefix: d.costPrefix! }))}
                projectId={id}
                minMarginPct={minMargin}
                data={sheetData}
                matchingTemplates={matchingTemplates}
                allTemplates={allTemplates}
                vendors={vendors.map((v) => ({ id: v.id, label: v.name }))}
                stockReservations={stockReservations}
                canViewCost={canViewCost}
                canViewPaycap={canViewPaycap}
                canEdit={canEditSheet}
              />
            )}
          </section>

          {/* CE-4 — vòng review với khách: nhận lại file khách đã sửa, đối chiếu từng dòng. */}
          {canViewCost && <ImportPanel projectId={id} result={importView} canEdit={canEditSheet} />}

          {/* ⚠ Khối so sánh phiên bản mang NGUYÊN `snapshotJson` xuống client — trong đó có totals
              (coTotal/ceTotal/ceService/phí) và giá từng dòng. Gate bằng ĐÚNG mã quyền của cột giá
              vốn, nếu không thì mọi số vừa giấu ở lưới lại lộ nguyên trong HTML thô của khối này. */}
          {canViewCost && (
          <RevisionCompare
            revisions={sheet.revisions.map<RevisionData>((r) => ({
              id: r.id,
              revNo: r.revNo,
              isBaseline: r.isBaseline,
              createdAt: r.createdAt,
              createdByName: r.createdBy?.fullName ?? null,
              note: r.note,
              kind: r.kind,
              ceTotal: Number(r.ceTotal),
              coTotal: Number(r.coTotal),
              marginPct: r.marginPct,
              snapshotJson: r.snapshotJson,
            }))}
            projectId={id}
            canTag={canTagRevision}
          />
          )}

          {/* Chuyển sang Nghiệm thu */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t("sendToLiquidation")}</h3>
                <p className="mt-1 max-w-lg text-xs text-muted-foreground">{t("sendToLiquidationHint")}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {sentRev
                    ? t("sentToLiquidationInfo", {
                        rev: sentRev.revNo,
                        date: sheet.sentToLiquidationAt ? formatDateTime(sheet.sentToLiquidationAt, locale) : "",
                        name: sheet.sentToLiquidationBy?.fullName ?? "—",
                      })
                    : t("sentToLiquidationNone")}
                </p>
              </div>
              {/* CE-5 — mốc thanh lý lấy từ bản ĐÃ GẮN vai trò Nghiệm thu; chưa gắn thì chặn ngay
                  ở đây để người dùng thấy lý do, thay vì để action lặng lẽ không làm gì. */}
              {hasAcceptanceRev ? (
                <form action={sendCostSheetToLiquidation.bind(null, id)}>
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-warning px-4 text-sm font-medium text-white hover:bg-warning/90"
                  >
                    <ArrowRight className="h-4 w-4" />
                    {t("sendToLiquidation")}
                  </button>
                </form>
              ) : (
                <p className="max-w-xs rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs font-medium text-warning">
                  {t("needAcceptanceRev")}
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
