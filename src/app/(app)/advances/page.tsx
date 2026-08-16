import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { getCurrentStaffId } from "@/lib/current-staff";
import { getStaffAdvanceQuota } from "@/lib/finance";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDate, toNum } from "@/lib/utils";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import type { Locale } from "@/i18n/locales";
import { MyRequestBoard, type RequestLine } from "./request-board";

const ADV_STATUS_TONE: Record<string, "neutral" | "warning" | "success" | "brand" | "danger"> = {
  REQUESTED: "warning",
  DISBURSED: "brand",
  SETTLED: "success",
  CANCELED: "neutral",
};

/**
 * "Tạm ứng của tôi" — trang CÁ NHÂN cho mọi người có `finance.advance.request` (20 nhóm quyền).
 *
 * Lý do tồn tại: form đề nghị tạm ứng trước đây chỉ nằm ở /finance, gác `finance.view` (5 vai) —
 * tức phần lớn người có quyền ĐỀ NGHỊ không mở được trang để đề nghị, và người đang giữ tạm ứng
 * không tự xem được mình còn hạn mức bao nhiêu. Trang này KHÔNG mở thêm dữ liệu kế toán nào:
 * - Danh sách tạm ứng chỉ lọc CỦA CHÍNH MÌNH (đề nghị hoặc đứng tên giữ tiền) — phạm vi do CÂU
 *   TRUY VẤN quyết định, như /creative/my và /staff/recruit/interviews.
 * - Bảng dòng chi phí chỉ hiện "còn được chi" (số người đề nghị buộc phải biết để đề nghị đúng),
 *   KHÔNG hiện CO/trần/đã chi từng khoản như bảng kế toán, KHÔNG hiện tạm ứng của người khác
 *   (kèm số tài khoản ngân hàng của họ).
 * Đường ghi vẫn là requestAdvance — đủ trần theo dòng + hạn mức NV + check trong transaction.
 */
export default async function MyAdvancesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  await requirePermission("finance.advance.request");
  const meId = await getCurrentStaffId();
  if (!meId) redirect("/login");

  const { project: projectParam } = await searchParams;
  const [t, tAdv, locale, projects, quota, myAdvances] = await Promise.all([
    getTranslations("myAdvances"),
    getTranslations("finance.advances"),
    getLocale() as Promise<Locale>,
    prisma.project.findMany({
      where: { status: { code: { in: [...EXECUTION_STATUS_CODES] } } },
      select: { id: true, code: true, name: true },
      orderBy: { updatedAt: "desc" },
    }),
    getStaffAdvanceQuota(meId),
    prisma.advance.findMany({
      where: { OR: [{ requestedById: meId }, { recipientStaffId: meId }] },
      orderBy: { requestedAt: "desc" },
      take: 100,
      include: {
        project: { select: { code: true, name: true } },
        financeCostLine: { select: { itemName: true, itemCode: true } },
        recipientVendor: { select: { name: true } },
        recipientStaff: { select: { fullName: true } },
      },
    }),
  ]);

  const projectId = projectParam && projects.some((p) => p.id === projectParam) ? projectParam : null;

  let requestLines: RequestLine[] = [];
  if (projectId) {
    const [lines, vendors, staff] = await Promise.all([
      // Chỉ dòng còn hiệu lực: dòng stale bị server chặn ứng, hiện ra chỉ để bấm rồi nhận lỗi.
      prisma.financeCostLine.findMany({
        where: { projectId, isStale: false },
        orderBy: { sort: "asc" },
        include: {
          vendorPayments: { where: { status: { not: "CANCELED" } }, select: { amount: true } },
          advances: { where: { status: { not: "CANCELED" } }, select: { amount: true } },
        },
      }),
      prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.staff.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    ]);
    const vendorOpts = vendors.map((v) => ({ id: v.id, label: v.name }));
    const staffOpts = staff.map((s) => ({ id: s.id, label: s.fullName }));
    requestLines = lines.map((l) => {
      const disbursed =
        l.advances.reduce((s, a) => s + toNum(a.amount), 0) + l.vendorPayments.reduce((s, p) => s + toNum(p.amount), 0);
      return {
        id: l.id,
        itemCode: l.itemCode,
        sectionName: l.sectionName,
        itemName: l.itemName,
        // Trần hiệu lực = payCap (CE-1) — cùng con số server chặn trong requestAdvance.
        remaining: toNum(l.payCap) - disbursed,
        vendorId: l.vendorId,
        vendors: vendorOpts,
        staff: staffOpts,
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
        <form method="get" className="flex items-end gap-2">
          <SearchableSelect
            name="project"
            defaultValue={projectId ?? ""}
            placeholder={t("pickProject")}
            className="w-64"
            options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
          />
          <button type="submit" className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
            OK
          </button>
        </form>
      </div>

      {/* Hạn mức của tôi — realtime, cùng nguồn số với chốt chặn trong requestAdvance */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("quotaTitle")}</h2>
          <span className="text-xs text-muted-foreground">
            {t("quotaLimit", { maxCount: quota.maxCount, maxAmount: formatNumber(quota.maxAmount, locale) })}
          </span>
        </div>
        <p className="mt-2 text-sm text-foreground">
          {t("quotaHolding", { count: quota.openCount, amount: formatNumber(quota.outstandingAmount, locale) })}
          {quota.blocked && <Badge tone="danger">{t("quotaBlocked")}</Badge>}
        </p>
      </section>

      {/* Đề nghị mới — chọn dự án rồi chọn dòng */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("newTitle")}</h2>
        {!projectId ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("pickProjectHint")}</p>
        ) : requestLines.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noLines")}</p>
        ) : (
          <div className="mt-2">
            <MyRequestBoard lines={requestLines} />
          </div>
        )}
      </section>

      {/* Lịch sử của tôi */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("listTitle")}</h2>
        {myAdvances.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("listEmpty")}</p>
        ) : (
          <div className="mt-2 space-y-2">
            {myAdvances.map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{a.project.code}</span>
                  <span className="font-medium text-foreground">{a.financeCostLine.itemName}</span>
                  <span className="tabular-nums text-foreground">{formatNumber(toNum(a.amount), locale)}</span>
                  <Badge tone={a.advanceType === "VENDOR" ? "neutral" : "brand"}>
                    {tAdv(a.advanceType === "VENDOR" ? "typeVendor" : "typeStaff")}
                  </Badge>
                  <Badge tone={ADV_STATUS_TONE[a.status] ?? "neutral"}>{tAdv(`status${a.status}`)}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {t("listMeta", {
                    recipient: a.recipientVendor?.name ?? a.recipientStaff?.fullName ?? "—",
                    date: formatDate(a.requestedAt),
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
