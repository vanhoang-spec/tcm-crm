import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { updateStaffRole } from "./actions";
import { requirePermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { PermissionMatrix } from "./permission-matrix";

const ROLE_GROUP_ORDER = [
  "ADMIN",
  "BOD",
  "FINANCE",
  "HR",
  "ACCOUNT",
  "CREATIVE",
  "PLANNING",
  "OPERATIONS",
  "PRODUCTION",
  "PURCHASING",
  "WAREHOUSE",
  "IT",
] as const;

const select =
  "h-9 min-w-[220px] rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default async function SettingsRolesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission("settings.roles.manage");
  const { tab } = await searchParams;
  const isMatrix = tab === "matrix";
  const [t, roles, staff] = await Promise.all([
    getTranslations("settings.roles"),
    prisma.role.findMany({ where: { isActive: true }, orderBy: { sort: "asc" }, include: { parent: true } }),
    prisma.staff.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      include: { department: { select: { name: true } }, role: { select: { id: true, groupCode: true, sort: true } } },
    }),
  ]);

  const rolesByGroup = new Map<string, typeof roles>();
  for (const r of roles) {
    const arr = rolesByGroup.get(r.groupCode) ?? [];
    arr.push(r);
    rolesByGroup.set(r.groupCode, arr);
  }

  const staffByGroup = new Map<string, typeof staff>();
  for (const s of staff) {
    const key = s.role?.groupCode ?? "UNASSIGNED";
    const arr = staffByGroup.get(key) ?? [];
    arr.push(s);
    staffByGroup.set(key, arr);
  }
  const groupOrder = [...ROLE_GROUP_ORDER, "UNASSIGNED"];

  const tabBase = "border-b-2 px-1 pb-2 text-sm font-medium transition-colors";
  const tabOn = "border-brand-500 text-foreground";
  const tabOff = "border-transparent text-muted-foreground hover:text-foreground";

  return (
    // Tab Ma trận rộng ~20 cột nên không giới hạn max-w như tab gán role.
    <div className={isMatrix ? "space-y-6" : "max-w-4xl space-y-6"}>
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Tab đi qua URL (?tab=matrix) — server component, không cần state phía client. */}
      <div className="flex gap-5 border-b border-border">
        <Link href="/settings/roles" className={cn(tabBase, isMatrix ? tabOff : tabOn)}>
          {t("tabAssign")}
        </Link>
        <Link href="/settings/roles?tab=matrix" className={cn(tabBase, isMatrix ? tabOn : tabOff)}>
          {t("tabMatrix")}
        </Link>
      </div>

      {isMatrix && <PermissionMatrix />}

      {!isMatrix && groupOrder.map((group) => {
        const rows = staffByGroup.get(group);
        if (!rows || rows.length === 0) return null;
        return (
          <section key={group} className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border bg-surface-2 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">{t(`group${group}`)}</h2>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-surface-2 text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">{t("colStaff")}</th>
                    <th className="px-4 py-2.5">{t("colDepartment")}</th>
                    <th className="px-4 py-2.5">{t("colTitle")}</th>
                    <th className="px-4 py-2.5">{t("colRole")}</th>
                    <th className="px-4 py-2.5">{t("colAction")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2.5 font-medium text-foreground">{s.fullName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.department?.name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.title ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <form action={updateStaffRole.bind(null, s.id)} className="flex items-center gap-2">
                          <select name="roleId" defaultValue={s.role?.id ?? ""} className={select}>
                            <option value="">{t("unassigned")}</option>
                            {ROLE_GROUP_ORDER.map((g) => {
                              const groupRoles = rolesByGroup.get(g);
                              if (!groupRoles || groupRoles.length === 0) return null;
                              return (
                                <optgroup key={g} label={t(`group${g}`)}>
                                  {groupRoles.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.name}
                                    </option>
                                  ))}
                                </optgroup>
                              );
                            })}
                          </select>
                          <button type="submit" className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
                            {t("save")}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {/* Danh mục role (phân cấp) — tham chiếu */}
      {!isMatrix && (
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("catalogTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("catalogHint")}</p>
        <div className="mt-3 space-y-3">
          {ROLE_GROUP_ORDER.map((g) => {
            const groupRoles = rolesByGroup.get(g);
            if (!groupRoles || groupRoles.length === 0) return null;
            return (
              <div key={g}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`group${g}`)}</h3>
                <ul className="mt-1 space-y-0.5">
                  {groupRoles.map((r) => (
                    <li key={r.id} className="text-sm text-foreground">
                      {r.name}
                      {r.parent && <span className="text-xs text-muted-foreground"> — {t("parentLabel")}: {r.parent.name}</span>}
                      {r.description && <p className="mt-0.5 text-xs font-normal text-muted-foreground">{r.description}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
      )}
    </div>
  );
}
