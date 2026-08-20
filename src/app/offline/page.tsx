import { WifiOff } from "lucide-react";

/**
 * Trang hiện khi mất mạng — service worker cache đúng trang này (xem public/sw.js).
 *
 * ⚠ CỐ Ý KHÔNG gác quyền và KHÔNG đọc DB: đây là thứ duy nhất còn dùng được khi không có mạng, gọi
 * `requirePermission` hay Prisma ở đây là trang chết đúng lúc cần nó nhất. Cũng KHÔNG dùng
 * `next-intl` — bản HTML này bị cache lúc cài, ngôn ngữ người dùng chọn sau đó sẽ không đổi được
 * nữa, nên viết cứng song ngữ cho khỏi hiện sai.
 */
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
      <WifiOff className="h-10 w-10 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">Không có kết nối mạng</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Kiểm tra lại wifi hoặc 4G rồi tải lại trang. Dữ liệu của bạn không mất — app chỉ cần mạng để đọc số liệu mới.
      </p>
      <p className="max-w-xs text-[11px] text-muted-foreground/70">No internet connection. Reconnect and reload.</p>
    </div>
  );
}
