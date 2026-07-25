import Link from "next/link";
import { cn, formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";

type Icon = React.ComponentType<{ className?: string }>;

const shell = "rounded-xl border border-border bg-surface p-5";
const header = "flex items-center gap-2 text-muted-foreground";

/**
 * Số tỷ lệ "cần chú ý / tổng" (vd "trễ/tổng") — cả 2 nửa là link riêng dẫn tới danh sách đã lọc đúng.
 * Nửa "cần chú ý" tô màu theo `tone` (mặc định danger), nửa tổng tô màu thường.
 * Khi thiếu href (chưa có trang lọc tương ứng) → render text tĩnh, KHÔNG tạo link giả.
 */
export function StatRatio({
  icon: IconComp,
  label,
  attention,
  total,
  attentionHref,
  totalHref,
  tone = "danger",
  locale,
  sub,
  highlight,
}: {
  icon?: Icon;
  label: string;
  attention: number;
  total: number;
  attentionHref?: string;
  totalHref?: string;
  tone?: "danger" | "warning" | "brand";
  locale: Locale;
  sub?: string;
  highlight?: boolean;
}) {
  const attentionTone = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-brand-600";
  return (
    <div className={cn(shell, highlight && "border-brand-300 ring-1 ring-brand-100")}>
      <div className={header}>
        {IconComp && <IconComp className="h-4 w-4" />}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1 text-2xl font-bold">
        {attentionHref ? (
          <Link href={attentionHref} className={cn(attentionTone, "hover:underline")}>
            {formatNumber(attention, locale)}
          </Link>
        ) : (
          <span className={attentionTone}>{formatNumber(attention, locale)}</span>
        )}
        <span className="text-muted-foreground">/</span>
        {totalHref ? (
          <Link href={totalHref} className="text-foreground hover:underline">
            {formatNumber(total, locale)}
          </Link>
        ) : (
          <span className="text-foreground">{formatNumber(total, locale)}</span>
        )}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/**
 * Số đơn (tiền hoặc đếm) có màu + link tùy chọn — dùng cho card kinh doanh dạng "active/tổng"
 * (không phải "trễ/tổng") và card Cashflow.
 */
export function StatValue({
  icon: IconComp,
  label,
  value,
  href,
  sub,
  tone = "foreground",
}: {
  icon?: Icon;
  label: string;
  value: string;
  href?: string;
  sub?: string;
  tone?: "foreground" | "success" | "danger" | "brand";
}) {
  const valueTone =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "brand" ? "text-brand-600" : "text-foreground";
  return (
    <div className={shell}>
      <div className={header}>
        {IconComp && <IconComp className="h-4 w-4" />}
        <span className="text-xs font-medium">{label}</span>
      </div>
      {href ? (
        <Link href={href} className={cn("mt-2 block text-2xl font-bold hover:underline", valueTone)}>
          {value}
        </Link>
      ) : (
        <div className={cn("mt-2 text-2xl font-bold", valueTone)}>{value}</div>
      )}
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
