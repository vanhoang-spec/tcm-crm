import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getDefaultPassword } from "@/lib/auth";
import { DefaultPasswordForm } from "./security-form";
import { requirePermission } from "@/lib/permissions";

export default async function SettingsSecurityPage() {
  await requirePermission("settings.security.manage");
  const [t, current, usingDefaultCount] = await Promise.all([
    getTranslations("settings.security"),
    getDefaultPassword(),
    // Nhân sự chưa từng đặt mật khẩu riêng → vẫn đăng nhập bằng mật khẩu chung.
    prisma.staff.count({ where: { isActive: true, passwordHash: null } }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <DefaultPasswordForm isStillFactoryDefault={current === "TCM123456"} />

      <p className="text-xs text-muted-foreground">{t("usingDefaultCount", { count: usingDefaultCount })}</p>
    </div>
  );
}
