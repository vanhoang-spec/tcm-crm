import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistrar } from "@/components/layout/service-worker";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /**
   * Màu thanh trạng thái khi cài app về màn hình chính.
   * ⚠ CỐ Ý KHÔNG đặt `maximumScale`/`userScalable: false` để chặn zoom: chặn zoom là chặn luôn
   * người cần phóng to để đọc. Ô nhập nào bị iOS auto-zoom thì sửa bằng cỡ chữ 16px trên mobile
   * (xem HANDOVER mục 10.52), không sửa bằng cách khoá zoom.
   */
  themeColor: "#0b84fa",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("title"),
    description: t("description"),
    // PWA: manifest sinh từ app/manifest.ts. Icon apple-touch phải khai riêng — iOS KHÔNG đọc manifest.
    manifest: "/manifest.webmanifest",
    icons: { apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "TCM", statusBarStyle: "default" },
    /**
     * ⚠ `appleWebApp.capable` của Next chỉ phát thẻ CHUẨN MỚI `mobile-web-app-capable`. Safari đời
     * cũ (trước iOS 15.4) chỉ đọc thẻ `apple-mobile-web-app-capable` — thiếu nó thì trên những máy
     * đó app cài về màn hình chính vẫn mở kèm thanh địa chỉ Safari. Khai thêm cho chắc; hai thẻ tồn
     * tại song song không xung đột.
     */
    other: { "apple-mobile-web-app-capable": "yes" },
  };
}

// Chạy trước khi React hydrate để tránh nhấp nháy (FOUC) khi đổi theme.
// Không có lựa chọn đã lưu → theo prefers-color-scheme hệ điều hành.
const themeInitScript = `(function(){try{var t=localStorage.getItem('tcm-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        {/* Đăng ký service worker SAU khi trang tải xong — không giành tài nguyên với lần render đầu. */}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
