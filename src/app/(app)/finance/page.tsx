import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatNumber, toNum } from "@/lib/utils";
import { getNumberSetting } from "@/lib/settings";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import type { Locale } from "@/i18n/locales";
import { refreshFinanceCostLines } from "./actions";
import { AdvanceBoard, type LineData } from "./advance-board";
import { requirePermission } from "@/lib/permissions";

export default async function FinanceAdvancesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  await requirePermission("finance.view");
  const { project: projectParam } = await searchParams;
  const [t, locale, projects, maxCount, maxAmount] = await Promise.all([
    getTranslations("finance.advances"),
    getLocale() as Promise<Locale>,
    prisma.project.findMany({
      where: { status: { code: { in: [...EXECUTION_STATUS_CODES] } } },
      include: { status: true },
      orderBy: { updatedAt: "desc" },
    }),
    getNumberSetting("finance", "max_advance_count_per_staff", 3),
    getNumberSetting("finance", "max_outstanding_advance_amount_per_staff", 50_000_000),
  ]);

  const projectId = projectParam && projects.some((p) => p.id === projectParam) ? projectParam : projects[0]?.id ?? null;

  // Quota overview (chéo dự án): NV đang giữ tạm ứng loại STAFF (REQUESTED|DISBURSED).
  const outstanding = await prisma.advance.findMany({
    where: { advanceType: "STAFF", status: { in: ["REQUESTED", "DISBURSED"] } },
    include: { recipientStaff: true },
  });
  const quotaMap = new Map<string, { name: string; count: number; amount: number }>();
  for (const a of outstanding) {
    if (!a.recipientStaffId) continue;
    const cur = quotaMap.get(a.recipientStaffId) ?? { name: a.recipientStaff?.fullName ?? "—", count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += toNum(a.amount);
    quotaMap.set(a.recipientStaffId, cur);
  }
  const quotaRows = [...quotaMap.values()].sort((a, b) => b.amount - a.amount);

  let lineData: LineData[] = [];
  let lastRevNo = 0;
  let currentRevNo = 0;
  if (projectId) {
    const [lines, vendors, staff, currentRev] = await Promise.all([
      prisma.financeCostLine.findMany({
        where: { projectId },
        orderBy: [{ isStale: "asc" }, { sort: "asc" }],
        include: {
          vendor: true,
          vendorPayments: { where: { status: { not: "CANCELED" } }, select: { amount: true } },
          advances: {
            orderBy: { installmentNo: "asc" },
            include: { recipientVendor: true, recipientStaff: true, requestedBy: true, disbursedBy: true, settledBy: true },
          },
        },
      }),
      prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      prisma.staff.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" } }),
      // revNo HIỆN TẠI của CO/CE — để so với sourceRevNo và cảnh báo khi dữ liệu đã cũ.
      prisma.costSheetRevision.findFirst({
        where: { costSheet: { projectId, version: "CTRACT" } },
        orderBy: { revNo: "desc" },
        select: { revNo: true },
      }),
    ]);
    // MIN chứ không phải MAX: đồng bộ KHÔNG nằm trong transaction, hỏng giữa chừng thì một phần
    // dòng mang revNo mới còn phần kia giữ trần cũ. Lấy MAX sẽ bằng revNo hiện tại và làm TẮT băng
    // cảnh báo bên dưới — đúng lúc cần bật nhất. Lấy MIN: chỉ cần một dòng còn cũ là còn cảnh báo.
    lastRevNo = lines.length > 0 ? lines.reduce((mn, l) => Math.min(mn, l.sourceRevNo), Infinity) : 0;
    currentRevNo = currentRev?.revNo ?? 0;
    const vendorOpts = vendors.map((v) => ({ id: v.id, label: v.name }));
    const staffOpts = staff.map((s) => ({ id: s.id, label: s.fullName }));
    lineData = lines.map((l) => {
      const advanced = l.advances.filter((a) => a.status !== "CANCELED").reduce((s, a) => s + toNum(a.amount), 0);
      const paid = l.vendorPayments.reduce((s, p) => s + toNum(p.amount), 0);
      const amount = toNum(l.amount);
      // TRẦN là netAmount (đã bóc gross-up thuế), và trừ CẢ tạm ứng lẫn thanh toán NCC.
      const netAmount = toNum(l.netAmount);
      return {
        id: l.id,
        sectionName: l.sectionName,
        itemName: l.itemName,
        amount,
        netAmount,
        itemCode: l.itemCode,
        advanced,
        paid,
        remaining: netAmount - advanced - paid,
        isStale: l.isStale,
        vendorId: l.vendorId,
        vendorLabel: l.vendor?.name ?? null,
        vendors: vendorOpts,
        staff: staffOpts,
        advances: l.advances.map((a) => ({
          id: a.id,
          installmentNo: a.installmentNo,
          amount: toNum(a.amount),
          advanceType: a.advanceType,
          recipientName: a.recipientVendor?.name ?? a.recipientStaff?.fullName ?? "—",
          bankName: a.bankName,
          bankAccountNo: a.bankAccountNo,
          bankAccountHolder: a.bankAccountHolder,
          status: a.status,
          requestedByName: a.requestedBy?.fullName ?? null,
          disbursedByName: a.disbursedBy?.fullName ?? null,
          disbursedAt: a.disbursedAt,
          settledByName: a.settledBy?.fullName ?? null,
          settledAt: a.settledAt,
        })),
      };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        </div>
        {/* Project picker */}
        <form method="get" className="flex items-end gap-2">
          <SearchableSelect
            name="project"
            defaultValue={projectId ?? ""}
            placeholder={t("noProject")}
            className="w-64"
            options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
          />
          <button type="submit" className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
            OK
          </button>
        </form>
      </div>

      {/* Quota overview */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("quotaTitle")}</h2>
          <span className="text-xs text-muted-foreground">{t("quotaLimit", { maxCount, maxAmount: formatNumber(maxAmount, locale) })}</span>
        </div>
        <ul className="mt-2 space-y-1 text-sm">
          {quotaRows.map((q) => (
            <li key={q.name} className="text-muted-foreground">
              {t("quotaLine", { name: q.name, count: q.count, amount: formatNumber(q.amount, locale) })}
            </li>
          ))}
          {quotaRows.length === 0 && <li className="text-sm text-muted-foreground">{t("quotaEmpty")}</li>}
        </ul>
      </section>

      {!projectId ? (
        <div className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">{t("noProject")}</div>
      ) : lineData.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("noSheet")}</p>
          <div className="mt-3">
            <form action={refreshFinanceCostLines.bind(null, projectId)}>
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium hover:bg-surface-2">
                <RefreshCw className="h-3.5 w-3.5" /> {t("refresh")}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <section className="rounded-xl border border-border bg-surface p-4">
          {/* Cảnh báo tiền thật: dòng CO/CE bị đổi tên/xóa sau khi đã ứng → dòng cũ stale giữ lịch sử,
              dòng MỚI (nếu là cùng hạng mục đổi tên) lại cho ứng full — dễ ứng lặp nếu không đối chiếu. */}
          {(() => {
            const staleAdvanced = lineData.filter((l) => l.isStale && l.advanced > 0);
            if (staleAdvanced.length === 0) return null;
            const total = staleAdvanced.reduce((s, l) => s + l.advanced, 0);
            return (
              <div className="mb-3 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">
                {t("staleAdvanceWarning", { count: staleAdvanced.length, amount: formatNumber(total, locale) })}
              </div>
            );
          })()}
          {/* Dữ liệu đã cũ: CO/CE đã sang revision mới hơn lần đồng bộ gần nhất. Nay CO/CE tự đồng bộ
              khi lưu, nên banner này chỉ xuất hiện khi lần sync đó thất bại — vẫn phải có, vì số
              tiền cũ nghĩa là TRẦN CHI sai: CO/CE giảm thì cho chi vượt, tăng thì chặn nhầm. */}
          {currentRevNo > lastRevNo && lineData.length > 0 && (
            <div className="mb-3 rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-danger">
              {t("outdatedWarning", { synced: lastRevNo, current: currentRevNo })}
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{t("refreshedInfo", { rev: lastRevNo, updated: lineData.length, added: 0, staled: lineData.filter((l) => l.isStale).length })}</span>
            <form action={refreshFinanceCostLines.bind(null, projectId)}>
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium hover:bg-surface-2">
                <RefreshCw className="h-3.5 w-3.5" /> {t("refresh")}
              </button>
            </form>
          </div>
          <AdvanceBoard lines={lineData} />
        </section>
      )}

      {projectId && (
        <p className="text-xs text-muted-foreground">
          <Link href={`/projects/${projectId}/co-ce`} className="text-brand-600 hover:underline">
            → Quản lý dự án · CO/CE
          </Link>
        </p>
      )}
    </div>
  );
}
