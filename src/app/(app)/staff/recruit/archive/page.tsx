import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * KHO HỒ SƠ — ứng viên đã chốt (từ chối hoặc đã nhận), tìm lại theo PHÒNG BAN / VỊ TRÍ.
 *
 * Đây là chỗ thực thi yêu cầu "từ chối thì chuyển toàn bộ hồ sơ sang lưu cho sau này tìm lại":
 * không có bảng riêng và không xoá gì cả — hồ sơ vẫn trỏ về đúng vị trí đã ứng tuyển, nên bộ lọc
 * theo phòng ban/vị trí chạy được ngay mà không cần sao chép dữ liệu sang đâu.
 *
 * ⚠ KHÔNG select `expectedSalary`: kho hồ sơ là màn hình danh sách, ô lương còn phải qua phép kiểm
 * theo bản ghi. Muốn xem thì mở hồ sơ.
 */
export default async function RecruitArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; position?: string; status?: string }>;
}) {
  await requirePermission("recruit.view");
  const t = await getTranslations("recruit");
  const sp = await searchParams;

  const status = sp.status === "HIRED" ? "HIRED" : sp.status === "ALL" ? "ALL" : "REJECTED";

  const [departments, positions, candidates] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.jobPosition.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true, departmentId: true } }),
    prisma.candidate.findMany({
      where: {
        status: status === "ALL" ? { in: ["HIRED", "REJECTED"] } : status,
        ...(sp.position ? { positionId: sp.position } : {}),
        ...(sp.dept ? { position: { departmentId: sp.dept } } : {}),
      },
      orderBy: { decidedAt: "desc" },
      take: 300,
      select: {
        id: true,
        fullName: true,
        status: true,
        decidedAt: true,
        decisionNote: true,
        summarySkills: true,
        position: { select: { title: true, department: { select: { name: true } } } },
      },
    }),
  ]);

  const select =
    "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <div className="space-y-4">
      <div>
        <Link href="/staff/recruit" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToList")}
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-foreground">{t("archiveTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("archiveSubtitle")}</p>
      </div>

      {/* Bộ lọc bằng GET thuần — không cần JS, và link kết quả chia sẻ lại được. */}
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("filterDepartment")}</span>
          <select name="dept" defaultValue={sp.dept ?? ""} className={select}>
            <option value="">{t("filterAll")}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("filterPosition")}</span>
          <select name="position" defaultValue={sp.position ?? ""} className={select}>
            <option value="">{t("filterAll")}</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("colStatus")}</span>
          <select name="status" defaultValue={status} className={select}>
            <option value="REJECTED">{t("statusREJECTED")}</option>
            <option value="HIRED">{t("statusHIRED")}</option>
            <option value="ALL">{t("filterAll")}</option>
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700"
        >
          {t("applyFilter")}
        </button>
      </form>

      {candidates.length === 0 && <p className="text-sm text-muted-foreground">{t("archiveEmpty")}</p>}

      <div className="space-y-2">
        {candidates.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/staff/recruit/candidates/${c.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                {c.fullName}
              </Link>
              <Badge tone={c.status === "HIRED" ? "success" : "danger"}>{t(`status${c.status}`)}</Badge>
              <span className="text-xs text-muted-foreground">
                {c.position.title}
                {c.position.department?.name ? ` · ${c.position.department.name}` : ""}
                {c.decidedAt ? ` · ${formatDate(c.decidedAt)}` : ""}
              </span>
            </div>
            {c.decisionNote && <p className="mt-1 text-xs text-foreground">{c.decisionNote}</p>}
            {c.summarySkills && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.summarySkills}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
