import { Fragment } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import type { Locale } from "@/i18n/locales";
import { prisma } from "@/lib/prisma";
import { pickLabel, cn } from "@/lib/utils";
import { PERMISSIONS, PERMISSION_MODULES, PERMISSION_MODULE_LABELS } from "@/lib/permission-catalog";
import { savePermissionMatrix } from "./actions";

/**
 * Ma trận quyền — hàng = quyền (gom theo module), cột = nhóm role.
 *
 * Cột ADMIN render sẵn-tick-và-khoá: role đó là sàn cứng trong lib/permissions.ts, không có dòng
 * grant nào trong DB. Cho sửa cột này sẽ tạo ảo giác là bỏ tick được, trong khi code vẫn cho qua.
 *
 * Bảng rộng (~20 cột) nên cuộn ngang TRONG wrapper riêng theo đúng pattern 25 bảng còn lại —
 * body trang không bao giờ cuộn ngang.
 */
export async function PermissionMatrix() {
  const [t, locale, roles, grants] = await Promise.all([
    getTranslations("settings.roles"),
    getLocale() as Promise<Locale>,
    prisma.role.findMany({ where: { isActive: true }, orderBy: { sort: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.rolePermission.findMany({ select: { roleId: true, permissionCode: true } }),
  ]);

  const granted = new Set(grants.map((g) => `${g.roleId}:${g.permissionCode}`));
  const byModule = new Map<string, typeof PERMISSIONS>();
  for (const p of PERMISSIONS) {
    const arr = byModule.get(p.module) ?? [];
    arr.push(p);
    byModule.set(p.module, arr);
  }

  return (
    <form action={savePermissionMatrix} className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("matrixTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("matrixHint")}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          {t("sensitiveLegend")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("adminAllAccessHint")}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[1400px] text-sm">
            <thead className="sticky top-0 z-20 border-b border-border bg-surface-2 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-30 bg-surface-2 px-4 py-2.5 text-left">{t("colPermission")}</th>
                {roles.map((r) => (
                  <th key={r.id} title={r.name} className="px-2 py-2.5 text-center font-medium">
                    {r.code === "ADMIN" ? t("adminAllAccess") : r.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PERMISSION_MODULES.map((mod) => {
                const perms = byModule.get(mod);
                if (!perms || perms.length === 0) return null;
                return (
                  <Fragment key={mod}>
                    <tr className="bg-surface-2/60">
                      <td colSpan={roles.length + 1} className="sticky left-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {pickLabel({ labelVi: PERMISSION_MODULE_LABELS[mod].labelVi, labelEn: PERMISSION_MODULE_LABELS[mod].labelEn }, locale)}
                      </td>
                    </tr>
                    {perms.map((p) => (
                      <tr key={p.code} className="hover:bg-surface-2/40">
                        <td className="sticky left-0 z-10 bg-surface px-4 py-2 text-foreground">
                          <span className={cn("flex items-center gap-1.5", p.sensitive && "font-medium")}>
                            {p.sensitive && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                            {pickLabel({ labelVi: p.labelVi, labelEn: p.labelEn }, locale)}
                          </span>
                          <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{p.code}</span>
                        </td>
                        {roles.map((r) => {
                          const isAdminRole = r.code === "ADMIN";
                          return (
                            <td key={r.id} className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                name={`p:${r.id}:${p.code}`}
                                defaultChecked={isAdminRole || granted.has(`${r.id}:${p.code}`)}
                                disabled={isAdminRole}
                                className="h-4 w-4 accent-brand-500 disabled:opacity-40"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <button type="submit" className="h-10 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600">
        {t("saveMatrix")}
      </button>
    </form>
  );
}
