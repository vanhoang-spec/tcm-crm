import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { checkPasswordAge } from "@/lib/password";
import { StaffCreateForm } from "./staff-create-form";
import { StaffRow } from "./staff-row";
import { requirePermission } from "@/lib/permissions";
import { matchesStaffQuery } from "@/lib/staff-search";

export default async function SettingsStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; team?: string; status?: string }>;
}) {
  await requirePermission("settings.staff.manage");
  const { q = "", dept = "", team = "", status = "" } = await searchParams;
  const tAuth = await getTranslations("auth.admin");
  const [staff, departments, teams, roles, activeStaff, t] = await Promise.all([
    prisma.staff.findMany({
      orderBy: { fullName: "asc" },
      include: {
        department: { select: { name: true } },
        team: { select: { name: true, code: true } },
        manager: { select: { fullName: true } },
        role: { select: { name: true } },
      },
    }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    // Gán nhóm quyền NGAY LÚC TẠO: bỏ trống thì người đó đăng nhập vào không mở được trang nào.
    prisma.role.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    // Ứng viên quản lý trực tiếp cho ô "Sửa phòng ban/team" ở từng hàng.
    prisma.staff.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    getTranslations("settings.staff"),
  ]);

  /**
   * Lọc trong BỘ NHỚ (~40 nhân sự) chứ không đẩy xuống SQL: yêu cầu là gõ KHÔNG DẤU vẫn ra, mà LIKE
   * của SQLite không bỏ được dấu tiếng Việt — muốn làm ở SQL phải thêm cột chuẩn hoá + migration.
   * Ba ô chọn lọc theo khoá; ô tìm là tự do (tên · email · điện thoại · mã NV · chức danh · phòng ban ·
   * team · nhóm quyền · tên quản lý), nhiều từ khoá = AND.
   */
  const filtered = staff.filter((s) => {
    if (dept && s.departmentId !== dept) return false;
    if (team && s.teamId !== team) return false;
    if (status === "active" && !s.isActive) return false;
    if (status === "inactive" && s.isActive) return false;
    return matchesStaffQuery(
      {
        fullName: s.fullName,
        email: s.email,
        phone: s.phone,
        code: s.code,
        title: s.title,
        departmentName: s.department?.name ?? null,
        teamName: s.team?.name ?? null,
        teamCode: s.team?.code ?? null,
        roleName: s.role?.name ?? null,
      },
      q,
    );
  });
  const hasFilter = !!(q || dept || team || status);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <StaffCreateForm departments={departments} teams={teams} roles={roles} />

      {/* Tìm nhanh — GET nên link chia sẻ được và F5 không mất bộ lọc */}
      <form className="flex flex-wrap items-center gap-2" action="/settings/staff" method="get">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <select name="dept" defaultValue={dept} aria-label={t("colDepartment")} className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm">
          <option value="">{t("filterAllDepartments")}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select name="team" defaultValue={team} aria-label={t("colTeam")} className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm">
          <option value="">{t("filterAllTeams")}</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} aria-label={t("colStatus")} className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm">
          <option value="">{t("filterAllStatuses")}</option>
          <option value="active">{t("filterActive")}</option>
          <option value="inactive">{t("filterInactive")}</option>
        </select>
        <button type="submit" className="h-9 rounded-lg border border-border-strong px-4 text-sm font-medium hover:bg-surface-2">
          {t("filterSubmit")}
        </button>
        {hasFilter && (
          <Link href="/settings/staff" className="h-9 rounded-lg px-3 text-sm font-medium leading-9 text-muted-foreground underline hover:text-foreground">
            {t("filterClear")}
          </Link>
        )}
        <span className="text-xs text-muted-foreground">{t("resultCount", { shown: filtered.length, total: staff.length })}</span>
      </form>

      <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("colName")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colEmail")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colTitle")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colDepartment")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colGender")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colLocation")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colManager")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colDob")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colFirstWorkDate")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colStatus")}</th>
              <th className="px-3 py-2 text-left font-medium">{tAuth("colPassword")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colActions")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colJoined")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((s) => (
              <StaffRow
                key={s.id}
                departments={departments}
                teams={teams}
                managers={activeStaff.filter((m) => m.id !== s.id)}
                staff={{
                  id: s.id,
                  fullName: s.fullName,
                  email: s.email,
                  title: s.title,
                  departmentId: s.departmentId,
                  departmentName: s.department?.name ?? null,
                  teamId: s.teamId,
                  teamName: s.team?.name ?? null,
                  gender: s.gender,
                  workLocation: s.workLocation,
                  managerId: s.managerId,
                  managerName: s.manager?.fullName ?? null,
                  isPlanningStaff: s.isPlanningStaff,
                  isActive: s.isActive,
                  payrollExempt: s.payrollExempt,
                  legalName: s.legalName,
                  isExternal: s.isExternal,
                  dateOfBirth: s.dateOfBirth,
                  firstWorkDate: s.firstWorkDate,
                  createdAt: s.createdAt,
                  passwordState: !s.passwordHash
                    ? "NEVER_SET"
                    : checkPasswordAge(s.passwordChangedAt).expired
                      ? "EXPIRED"
                      : "OK",
                  lastLoginAt: s.lastLoginAt,
                  locked: !!s.lockedUntil && s.lockedUntil > new Date(),
                }}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("noResult")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
