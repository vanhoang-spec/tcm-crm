"use client";

import { useEffect } from "react";

/**
 * Đăng ký service worker cho PWA.
 *
 * ⚠ Đăng ký SAU sự kiện `load`, không phải lúc render: đăng ký sớm là giành băng thông và luồng
 * chính với chính lần tải trang đầu tiên — đúng thứ phải tránh (yêu cầu chủ dự án: không được làm
 * chậm bất kỳ trang nào). Sau `load` thì mọi thứ người dùng nhìn thấy đã xong.
 *
 * Lỗi đăng ký (trình duyệt cũ, chạy trên HTTP không phải HTTPS/localhost) được nuốt: PWA là tính
 * năng cộng thêm, không được làm vỡ app khi thiếu.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* im lặng — không có service worker thì app vẫn chạy y như cũ */
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
