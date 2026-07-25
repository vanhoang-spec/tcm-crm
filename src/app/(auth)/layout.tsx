import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Vỏ cho các trang chưa/đang xác thực (đăng nhập, quên mật khẩu, ép đổi mật khẩu).
 * KHÔNG có sidebar/header nội bộ — người chưa đăng nhập không được thấy cấu trúc app.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("meta");

  return (
    <div className="flex min-h-screen flex-col bg-surface-2">
      <div className="flex items-center justify-end gap-2 p-4">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <Image src="/brand/logo.png" alt="TCM" width={168} height={71} priority className="h-auto w-[168px]" />
            <p className="mt-3 text-xs text-muted-foreground">{t("title")}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
