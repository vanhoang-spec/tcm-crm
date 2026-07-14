import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/** Shell tối giản cho guest (PIC khách) — KHÔNG có sidebar/nav nội bộ TCM. */
export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("guest");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur">
        <span className="text-sm font-bold tracking-tight text-brand-700">TCM</span>
        <span className="text-xs text-muted-foreground">{t("poweredBy")}</span>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
