import type { MetadataRoute } from "next";

/**
 * Manifest cho PWA — cho phép cài app về màn hình chính (điện thoại + PC), không qua App Store.
 *
 * Dùng quy ước `app/manifest.ts` của Next App Router (sinh ra `/manifest.webmanifest`) thay vì file
 * tĩnh trong `public/`: có kiểu, và đổi tên/màu thì chỉ sửa một chỗ.
 *
 * ⚠ KHÔNG dịch theo ngôn ngữ: manifest được hệ điều hành đọc MỘT LẦN lúc cài, sau đó tên trên màn
 * hình chính không đổi nữa. Đặt tên tiếng Việt cố định để mọi máy hiện giống nhau.
 *
 * ⚠ `start_url: "/"` vẫn đi qua cổng đăng nhập bình thường — mở app đã cài mà chưa đăng nhập thì
 * rơi vào `/login` y như mở bằng trình duyệt. PWA KHÔNG bỏ qua bất kỳ chốt chặn quyền nào.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TCM — Nền tảng vận hành nội bộ",
    short_name: "TCM",
    description: "Nền tảng vận hành nội bộ TCM: dự án, CO/CE, kho, nhân sự, chat.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#0b84fa",
    lang: "vi",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      // `any`: nền trong suốt, hệ điều hành tự bo góc.
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // `maskable`: Android CẮT icon theo hình của máy — phải có nền đặc và chừa vùng an toàn 80%,
      // nếu không thì mark bị xén mất rìa. Đây là hai file riêng, không dùng chung với bản `any`.
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
