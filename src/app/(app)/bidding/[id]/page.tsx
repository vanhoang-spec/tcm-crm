import Link from "next/link";
import { NumberField } from "@/components/ui/number-field";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Flag, Check, X, Link2, FileSpreadsheet, Printer } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getApprovedReservations } from "@/lib/stock-reservation";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { formatDate, formatNumber, pickLabel, toNum } from "@/lib/utils";
import { getNumberSetting } from "@/lib/settings";
import { COMPLEXITY_TONE, STATUS_TONE, TEAM_TONE } from "@/lib/bidding-ui";
import { computeMarginPct } from "@/lib/bidding";
import type { Locale } from "@/i18n/locales";
import { CostSheetBuilder, type CostSheetData, type TemplateOption } from "../cost-sheet-builder";
import { ResultActions } from "../result-actions";
import { ApproveCostSheetActions } from "../approve-costsheet-actions";
import { AssignTeamForm } from "../assign-team-form";
import { OrderPanel, type OrderData } from "../order-panel";
import {
  AccountantConfirmAcceptanceDocs,
  AccountantConfirmContractDone,
  MarkFinishedButton,
  MoveToLiquidationButton,
} from "../workflow-actions";
import { decideGoNogo, addBiddingRound, saveContract } from "../actions";
import { hasPermission, requirePermission } from "@/lib/permissions";

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export default async function BiddingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("bidding.view");
  const { id } = await params;
  // CE-2 — GATE CỘT theo quyền, quyết định TẠI SERVER: số bị gate không được vào HTML (bài học
  // KB-H2). PUR/OPE/PRO thấy diễn giải + CO trước thuế + trần chi; không thấy CE/Total CO/margin.
  const canViewCost = await hasPermission("bidding.costsheet.view_cost");
  const canViewPaycap = await hasPermission("bidding.costsheet.view_paycap");

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      ownerTeam: true,
      owner: true,
      status: true,
      projectType: true,
      complexity: true,
      goNogoBy: true,
      contract: { include: { accountantConfirmedBy: true, acceptanceDocsConfirmedBy: true } },
      biddingRounds: { orderBy: { roundNo: "asc" } },
      orders: {
        include: {
          sentBy: true,
          acceptedBy: true,
          resultSentBy: true,
          creativeItems: true,
          attendees: { include: { staff: true } },
        },
      },
      costSheets: {
        where: { version: "CTRACT" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          approvedBy: true,
          rejectedBy: true,
          sections: { orderBy: { sort: "asc" }, include: { lines: { orderBy: { sort: "asc" } } } },
        },
      },
    },
  });
  if (!project) notFound();

  const [t, tGo, tOrder, tRounds, tContract, tResult, tCostsheet, tCommon, locale, minMargin, orderResponseDays] = await Promise.all([
    getTranslations("bidding.detail"),
    getTranslations("bidding.gonogo"),
    getTranslations("bidding.order"),
    getTranslations("bidding.rounds"),
    getTranslations("bidding.contract"),
    getTranslations("bidding.result"),
    getTranslations("bidding.costsheet"),
    getTranslations("common"),
    getLocale() as Promise<Locale>,
    getNumberSetting("bidding", "min_margin_pct", 31),
    getNumberSetting("bidding", "order_response_days", 4),
  ]);

  const [matchingTemplatesRaw, allTemplatesRaw, teams, activeStaff, costDepartments, vendors, failReasonSet, auditEntries, stockReservations] = await Promise.all([
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
    prisma.team.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.staff.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" } }),
    prisma.department.findMany({ where: { costPrefix: { not: null }, isActive: true }, select: { code: true, name: true, costPrefix: true }, orderBy: { code: "asc" } }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.optionSet.findUnique({ where: { code: "fail_reason" }, include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } } }),
    prisma.auditLog.findMany({ where: { entityType: "project", entityId: project.id }, orderBy: { changedAt: "desc" }, take: 8 }),
    getApprovedReservations(project.id),
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
          stockResvLineId: null, // template không mang liên kết kho — chèn từ panel "Kho đã duyệt"
          stockRefUnitPrice: null,
          legCode: "", // template không mang nhãn chặng — gắn khi dựng bảng thật
          note: "",
          ceQuantity: null, // mẫu không mang CE — bảng dựng từ mẫu bắt đầu ở chế độ cũ
          ceUnitPrice: null,
          ceGroupKey: null,
          ceName: "",
          vatPct: null,
        })),
      })),
    };
  }
  const matchingTemplates = matchingTemplatesRaw.map(toTemplateOption);
  const allTemplates = allTemplatesRaw.map(toTemplateOption);

  const sheet = project.costSheets[0] ?? null;
  const sheetData: CostSheetData | null = sheet
    ? {
        scenario: sheet.scenario,
        vatPct: sheet.vatPct,
        agencyFeePct: sheet.agencyFeePct,
        mgmtFeePct: sheet.mgmtFeePct,
        contingencyPct: sheet.contingencyPct,
        discountPct: sheet.discountPct,
        ceTotal: toNum(sheet.ceTotal),
        templateId: sheet.templateId,
        approvedByName: sheet.approvedBy?.fullName ?? null,
        approvedAt: sheet.approvedAt ? formatDate(sheet.approvedAt) : null,
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
            // Giá CE là số bị gate: KHÔNG đưa vào payload khi thiếu quyền (nhãn gộp thì giữ).
            ceQuantity: canViewCost ? l.ceQuantity : null,
            ceUnitPrice: canViewCost && l.ceUnitPrice != null ? toNum(l.ceUnitPrice) : null,
            ceGroupKey: l.ceGroupKey,
            ceName: l.ceName ?? "",
            vatPct: l.vatPct,
          })),
        })),
      }
    : null;

  const decideBound = decideGoNogo.bind(null, project.id);
  const roundBound = addBiddingRound.bind(null, project.id);
  const contractBound = saveContract.bind(null, project.id);
  const goReasons = [
    project.complexity.code === "COMPLEX" ? tGo("reasonComplex") : null,
    project.client.isNew ? tGo("reasonNewClient") : null,
  ].filter(Boolean).join(", ");

  const statusCode = project.status.code;
  const isBiddingPhase = statusCode === "BIDDING" || statusCode === "PENDING";
  const goNogoBlocked = project.goNogoStatus === "PENDING";
  // Badge "chờ duyệt" hiện cho mọi người (thông tin), nhưng NÚT duyệt/từ chối chỉ hiện với người có
  // quyền: server đã chặn bằng requirePermission, mà chặn kiểu đó là đá người dùng về Dashboard —
  // bấm một nút rồi văng ra không lời giải thích thì tệ hơn là không thấy nút.
  const pendingApproval = !!sheet && !sheet.approvedById && !sheet.rejectedAt;
  const canApproveCostSheet = pendingApproval && (await hasPermission("bidding.costsheet.approve"));
  // Sửa bảng đòi CẢ quyền sửa LẪN quyền xem giá vốn: payload đã bị tước số CE khi thiếu view_cost,
  // cho lưu là ghi đè CE thành rỗng — mất số của Account mà không ai thấy.
  const canEditCostSheet = canViewCost && (await hasPermission("bidding.costsheet.edit"));
  const sheetCoTotal = sheet ? toNum(sheet.coTotal) : 0;
  const sheetCeTotal = sheet ? toNum(sheet.ceTotal) : 0;
  const sheetMarginPct = sheet ? computeMarginPct(sheetCeTotal, sheetCoTotal) : 0;
  const sheetApprovalTone = !sheet ? "neutral" : sheet.rejectedAt ? "danger" : sheet.approvedById ? "success" : "warning";
  const sheetApprovalLabel = !sheet
    ? tCostsheet("noSheet")
    : sheet.rejectedAt
      ? tCostsheet("rejected")
      : sheet.approvedById
        ? tCostsheet("approved")
        : tCostsheet("pendingApproval");
  const lastRound = project.biddingRounds[project.biddingRounds.length - 1] ?? null;

  const orderData: OrderData[] = project.orders.map((o) => ({
    id: o.id,
    department: o.department,
    status: o.status,
    briefLinkUrl: o.briefLinkUrl,
    extraBriefInfo: o.extraBriefInfo,
    outputRequest: o.outputRequest,
    desiredTimeline: o.desiredTimeline,
    meetingAt: o.meetingAt,
    meetingLocation: o.meetingLocation,
    meetingFormat: o.meetingFormat,
    sentByName: o.sentBy?.fullName ?? null,
    sentAt: o.sentAt,
    acceptedByName: o.acceptedBy?.fullName ?? null,
    acceptedAt: o.acceptedAt,
    resultLinkUrl: o.resultLinkUrl,
    resultSentAt: o.resultSentAt,
    resultSentByName: o.resultSentBy?.fullName ?? null,
    creativeItems: o.creativeItems.map((ci) => ({ label: ci.label, detail: ci.detail })),
    attendeeNames: o.attendees.map((a) => a.staff.fullName),
  }));
  const suggestedTimelineDate = new Date(project.createdAt);
  suggestedTimelineDate.setDate(suggestedTimelineDate.getDate() + orderResponseDays);
  const suggestedTimeline = suggestedTimelineDate.toISOString().slice(0, 10);
  const accountName = project.owner?.fullName ?? project.ownerTeam?.code ?? tOrder("accountFallback");

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/bidding" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToList")}
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{project.name}</h1>
            <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
            <Badge tone={STATUS_TONE[statusCode] ?? "neutral"}>{pickLabel(project.status, locale)}</Badge>
            <Badge tone={COMPLEXITY_TONE[project.complexity.code] ?? "neutral"}>{pickLabel(project.complexity, locale)}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {project.ownerTeam ? (
              <Badge tone={TEAM_TONE[project.ownerTeam.code] ?? "neutral"}>{project.ownerTeam.code}</Badge>
            ) : (
              <Badge tone="warning">{t("teamUnassigned")}</Badge>
            )}
            <span>{t("clientLabel")}: {project.client.name}</span>
            {project.projectType && <span>· {pickLabel(project.projectType, locale)}</span>}
            {project.owner && <span>· {t("ownerLabel")}: {project.owner.fullName}</span>}
            {project.briefLinkUrl ? (
              <a href={project.briefLinkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                <Link2 className="h-3 w-3" />
                {t("briefLinkLabel")}
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">{t("briefLinkMissing")}</span>
            )}
          </div>
        </div>
        <LinkButton href={`/bidding/${project.id}/edit`} variant="secondary" size="sm">
          <Pencil className="h-3.5 w-3.5" />
          {tCommon("edit")}
        </LinkButton>
      </div>

      {!project.ownerTeam && <AssignTeamForm projectId={project.id} teams={teams.map((tm) => ({ id: tm.id, label: `${tm.code} — ${tm.name}` }))} />}

      <OrderPanel
        projectId={project.id}
        briefLinkUrl={project.briefLinkUrl ?? ""}
        orders={orderData}
        staff={activeStaff.map((s) => ({ id: s.id, label: s.fullName }))}
        accountName={accountName}
        suggestedTimeline={suggestedTimeline}
      />

      {/* Go/No-Go */}
      {project.goNogoStatus && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">{tGo("title")}</h2>
          {project.goNogoStatus === "PENDING" ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">{tGo("reason", { reasons: goReasons })}</p>
              <form action={decideBound} className="mt-3 space-y-2">
                <input name="note" placeholder={tGo("notePlaceholder")} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:max-w-md" />
                <div className="flex gap-2">
                  <button name="decision" value="GO" className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-2 text-xs font-medium text-white hover:bg-success/90">
                    <Check className="h-3.5 w-3.5" /> {tGo("go")}
                  </button>
                  <button name="decision" value="NOGO" className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-2 text-xs font-medium text-danger hover:bg-danger-bg">
                    <X className="h-3.5 w-3.5" /> {tGo("nogo")}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <p className="mt-1 text-sm">
              <Badge tone={project.goNogoStatus === "GO" ? "success" : "danger"}>
                {project.goNogoStatus === "GO" ? tGo("decidedGo") : tGo("decidedNogo")}
              </Badge>{" "}
              {project.goNogoBy && (
                <span className="text-xs text-muted-foreground">
                  {tGo("decidedBy", { name: project.goNogoBy.fullName, date: project.goNogoAt ? formatDate(project.goNogoAt) : "" })}
                </span>
              )}
              {project.goNogoNote && <span className="block text-xs italic text-muted-foreground">&ldquo;{project.goNogoNote}&rdquo;</span>}
            </p>
          )}
        </section>
      )}

      {/* Mobile: chỉ ưu tiên PIC/timeline/nút chuyển trạng thái — bảng biểu chi tiết (CO/CE, vòng deal, nhật ký) dồn hết cho máy tính. */}
      <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-3 py-2 text-xs text-muted-foreground sm:hidden">
        {t("mobileFullDetailNote")}
      </p>

      {/* CO/CE builder */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{tCostsheet("title")}</h2>
          <div className="flex flex-wrap items-center gap-3">
            {/* Xuất báo giá — dùng nhiều nhất ở giai đoạn thầu (16/21 dự án đang BIDDING). */}
            {sheet && (
              <>
                <a href={`/api/costsheet/${project.id}/quotation?mode=client`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> {tCostsheet("exportClientXlsx")}
                </a>
                {/* Bố cục nhiều sheet: mỗi mục lớn một sheet + sheet TỔNG HỢP — cùng một model số. */}
                <a href={`/api/costsheet/${project.id}/quotation?mode=client&layout=multi`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> {tCostsheet("exportClientMulti")}
                </a>
                <a href={`/api/costsheet/${project.id}/quotation?mode=internal`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> {tCostsheet("exportInternalXlsx")}
                </a>
                <Link href={`/projects/${project.id}/co-ce/print`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  <Printer className="h-3.5 w-3.5" /> {tCostsheet("printView")}
                </Link>
              </>
            )}
            {canApproveCostSheet && <span className="hidden sm:block"><ApproveCostSheetActions projectId={project.id} costSheetId={sheet!.id} belowMinMargin={sheetMarginPct < minMargin} /></span>}
          </div>
        </div>
        {sheet?.rejectedAt && (
          <p className="mb-3 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
            {tCostsheet("rejectedBy", { name: sheet.rejectedBy?.fullName ?? "—", date: formatDate(sheet.rejectedAt) })}
            {sheet.rejectedNote && <> — {tCostsheet("rejectedNoteLabel", { note: sheet.rejectedNote })}</>}
          </p>
        )}

        {/* Mobile: tóm tắt CO/CE/margin + trạng thái duyệt + nút Duyệt/Từ chối (nếu đang chờ).
            Ba ô tiền gate bằng `view_cost` — giấu ở lưới mà để hở ở đây là vô nghĩa. */}
        <div className="grid grid-cols-2 gap-2 text-xs sm:hidden">
          {canViewCost && (
            <>
              <div className="rounded-lg border border-border p-2">
                <span className="block text-muted-foreground">{tCostsheet("coTotal")}</span>
                <span className="font-semibold text-foreground">{formatNumber(sheetCoTotal, locale)}</span>
              </div>
              <div className="rounded-lg border border-border p-2">
                <span className="block text-muted-foreground">{tCostsheet("ceTotal")}</span>
                <span className="font-semibold text-foreground">{formatNumber(sheetCeTotal, locale)}</span>
              </div>
              <div className="rounded-lg border border-border p-2">
                <span className="block text-muted-foreground">{tCostsheet("margin")}</span>
                <span className="font-semibold text-foreground">{formatNumber(sheetMarginPct, locale)}%</span>
              </div>
            </>
          )}
          <div className="rounded-lg border border-border p-2">
            <Badge tone={sheetApprovalTone}>{sheetApprovalLabel}</Badge>
          </div>
          {canApproveCostSheet && (
            <div className="col-span-2">
              <ApproveCostSheetActions projectId={project.id} costSheetId={sheet!.id} belowMinMargin={sheetMarginPct < minMargin} />
            </div>
          )}
        </div>

        {goNogoBlocked ? (
          <p className="text-sm text-muted-foreground">{tGo("reason", { reasons: goReasons })}</p>
        ) : (
          <div className="hidden sm:block">
            <CostSheetBuilder
                departments={costDepartments.map((d) => ({ code: d.code, name: d.name, costPrefix: d.costPrefix! }))}
              projectId={project.id}
              minMarginPct={minMargin}
              data={sheetData}
              matchingTemplates={matchingTemplates}
              allTemplates={allTemplates}
              vendors={vendors.map((v) => ({ id: v.id, label: v.name }))}
              stockReservations={stockReservations}
              canViewCost={canViewCost}
              canViewPaycap={canViewPaycap}
              canEdit={canEditCostSheet}
            />
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Deal rounds */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">{tRounds("title")}</h2>

            {/* Mobile: chỉ đếm số vòng + trạng thái vòng gần nhất, chi tiết xem trên máy tính */}
            <div className="mt-2 sm:hidden">
              {project.biddingRounds.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tRounds("none")}</p>
              ) : (
                <p className="text-sm text-foreground">
                  {tRounds("mobileSummary", { count: project.biddingRounds.length })}
                  {" · "}
                  <Badge
                    tone={
                      lastRound?.outcome === "accepted" ? "success" : lastRound?.outcome === "rejected" ? "danger" : "neutral"
                    }
                  >
                    {tRounds(lastRound?.outcome === "accepted" ? "outcomeAccepted" : lastRound?.outcome === "rejected" ? "outcomeRejected" : "outcomeOngoing")}
                  </Badge>
                </p>
              )}
            </div>

            <div className="hidden sm:block">
              <ul className="mt-3 space-y-2">
                {project.biddingRounds.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{tRounds("roundNo", { n: r.roundNo })}</span>
                      <Badge tone={r.outcome === "accepted" ? "success" : r.outcome === "rejected" ? "danger" : "neutral"}>
                        {tRounds(r.outcome === "accepted" ? "outcomeAccepted" : r.outcome === "rejected" ? "outcomeRejected" : "outcomeOngoing")}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDate(r.roundDate)}
                      {r.revisedCe != null && <> · {tRounds("revisedCe")}: {formatNumber(toNum(r.revisedCe), locale)}</>}
                    </div>
                    {r.clientFeedback && <p className="mt-1 text-xs">{r.clientFeedback}</p>}
                  </li>
                ))}
                {project.biddingRounds.length === 0 && <li className="text-sm text-muted-foreground">{tRounds("none")}</li>}
              </ul>
              <details className="mt-3 rounded-lg border border-dashed border-border-strong p-3">
                <summary className="cursor-pointer text-xs font-medium text-brand-600">{tRounds("add")}</summary>
                <form action={roundBound} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input name="clientFeedback" placeholder={tRounds("feedback")} className={smallInput} />
                  <NumberField name="revisedCe" placeholder={tRounds("revisedCe")} className={smallInput} />
                  <select name="outcome" defaultValue="ongoing" className={smallInput}>
                    <option value="ongoing">{tRounds("outcomeOngoing")}</option>
                    <option value="accepted">{tRounds("outcomeAccepted")}</option>
                    <option value="rejected">{tRounds("outcomeRejected")}</option>
                  </select>
                  <div className="sm:col-span-2">
                    <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">{tRounds("save")}</button>
                  </div>
                </form>
              </details>
            </div>
          </section>

          {/* Contract */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">{tContract("title")}</h2>
            <form action={contractBound} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labeled label={tContract("contractNo")}>
                <input name="contractNo" defaultValue={project.contract?.contractNo ?? ""} className={smallInput} />
              </Labeled>
              <Labeled label={tContract("contractDate")}>
                <DateField name="contractDate" defaultValue={toDateInput(project.contract?.contractDate ?? null)} className={smallInput} />
              </Labeled>
              <Labeled label={tContract("poNo")}>
                <input name="poNo" defaultValue={project.contract?.poNo ?? ""} className={smallInput} />
              </Labeled>
              <Labeled label={tContract("poDate")}>
                <DateField name="poDate" defaultValue={toDateInput(project.contract?.poDate ?? null)} className={smallInput} />
              </Labeled>
              <Labeled label={tContract("paymentTerm")}>
                <NumberField name="paymentTermDays" defaultValue={project.contract?.paymentTermDays ?? project.client.paymentTermDays} className={smallInput} />
              </Labeled>
              <Labeled label={tContract("templateSource")}>
                <select name="templateSource" defaultValue={project.contract?.templateSource ?? "CLIENT"} className={smallInput}>
                  <option value="CLIENT">{tContract("sourceClient")}</option>
                  <option value="TCM">{tContract("sourceTcm")}</option>
                </select>
              </Labeled>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input type="checkbox" name="signed" defaultChecked={project.contract?.signed} className="h-3.5 w-3.5 rounded border-border-strong" />
                {tContract("signed")}
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input type="checkbox" name="confirmEmail" defaultChecked={!!project.contract?.confirmEmailAt} className="h-3.5 w-3.5 rounded border-border-strong" />
                {tContract("confirmEmail")}
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">{tContract("save")}</button>
              </div>
            </form>

            {(statusCode === "PROCESSING" || statusCode === "LIQUIDATION" || statusCode === "FINISHED") && (
              <div className="mt-4 space-y-2 border-t border-border pt-3">
                <h3 className="text-xs font-semibold text-foreground">{tContract("accountantConfirmTitle")}</h3>
                {project.contract?.accountantConfirmedAt ? (
                  <p className="text-xs text-success">
                    {tContract("accountantConfirmedBy", {
                      name: project.contract.accountantConfirmedBy?.fullName ?? "—",
                      date: formatDate(project.contract.accountantConfirmedAt),
                    })}
                  </p>
                ) : (
                  statusCode === "PROCESSING" && <AccountantConfirmContractDone projectId={project.id} />
                )}
                {(statusCode === "LIQUIDATION" || statusCode === "FINISHED") && (
                  project.contract?.acceptanceDocsConfirmedAt ? (
                    <p className="text-xs text-success">
                      {tContract("acceptanceDocsConfirmedBy", {
                        name: project.contract.acceptanceDocsConfirmedBy?.fullName ?? "—",
                        date: formatDate(project.contract.acceptanceDocsConfirmedAt),
                      })}
                    </p>
                  ) : (
                    statusCode === "LIQUIDATION" && <AccountantConfirmAcceptanceDocs projectId={project.id} />
                  )
                )}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* Result / handoff */}
          {isBiddingPhase && !goNogoBlocked && (
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Flag className="h-4 w-4" />
                {tResult("title")}
              </h2>
              <div className="mt-3">
                <ResultActions
                  projectId={project.id}
                  failReasons={(failReasonSet?.items ?? []).map((r) => ({ id: r.id, code: r.code, label: pickLabel(r, locale) }))}
                />
              </div>
            </section>
          )}

          {statusCode === "PROCESSING" && (
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Flag className="h-4 w-4" />
                {tResult("title")}
              </h2>
              <div className="mt-3">
                <MoveToLiquidationButton projectId={project.id} />
              </div>
            </section>
          )}

          {statusCode === "LIQUIDATION" && (
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Flag className="h-4 w-4" />
                {tResult("title")}
              </h2>
              <div className="mt-3">
                <MarkFinishedButton projectId={project.id} />
              </div>
            </section>
          )}

          {/* Audit */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("auditTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:hidden">
              {auditEntries.length === 0 ? t("noAudit") : t("auditMobileSummary", { count: auditEntries.length })}
            </p>
            <ul className="mt-3 hidden space-y-2 text-xs text-muted-foreground sm:block">
              {auditEntries.map((a) => (
                <li key={a.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
                  <span className="font-medium text-foreground">{a.action}</span> · {a.field} · {formatDate(a.changedAt)}
                </li>
              ))}
              {auditEntries.length === 0 && <li>{t("noAudit")}</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

const smallInput = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
