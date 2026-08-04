import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";

type Icon = React.ComponentType<{ className?: string }>;
type Tone = "brand" | "danger" | "warning" | "success";

/*
 * Bộ thành phần trình bày của Dashboard — chỉ `src/app/(app)/page.tsx` dùng.
 *
 * ⚠ QUY ƯỚC MÀU, đọc trước khi sửa: chỉ 3 token brand ĐỔI GIÁ TRỊ ở dark mode là `brand-50`,
 * `brand-100` và `brand-950` (xem globals.css). `brand-600`/`brand-700` giữ nguyên màu xanh sáng
 * trên nền tối nên chữ số tô bằng chúng rất khó đọc ở theme tối. Vì vậy ở đây:
 *   • chữ số lớn luôn `text-foreground` — trừ khi chính con số đó LÀ cảnh báo (`text-danger`),
 *   • màu thương hiệu chỉ nằm ở nền tint (`bg-brand-50`), thanh tỷ lệ (`bg-brand-500`) và viền
 *     (`border-brand-200`) — ba chỗ không mang chữ.
 * Rãnh thanh tỷ lệ dùng `bg-border` vì đó là màu duy nhất tương phản đủ trên CẢ nền `surface`
 * lẫn nền `brand-50` ở cả hai theme.
 */

const CARD = "rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]";
// Nhãn nhỏ dùng `foreground/70` chứ KHÔNG dùng `muted-foreground`: nền tint `brand-50` kéo tương
// phản của muted xuống 4,36 — dưới ngưỡng AA 4,5 cho chữ 11px. Sắc độ theo % của foreground tự
// trộn với nền nào cũng đủ tương phản ở CẢ hai theme. Đo trên trang (canvas, đã giải oklab):
// CAP 6,44–6,69 (sáng) · 7,45–7,80 (tối); SUB 5,38 (sáng) · 6,62 (tối).
const CAP = "text-[11px] font-semibold uppercase tracking-wide text-foreground/70";
const SUB = "text-foreground/65";

const FILL: Record<Tone, string> = {
  brand: "bg-brand-500",
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
};

const TEXT: Record<Tone, string> = {
  brand: "text-foreground",
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
};

/** Tỷ lệ 0–1. total = 0 → 0 (không chia 0, không NaN lọt vào style width). */
function share(part: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, part / total)) : 0;
}

function pctText(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Thanh tỷ lệ một khối. */
function Bar({ value, tone, className }: { value: number; tone: Tone; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-border", className)} aria-hidden>
      <div className={cn("h-full rounded-full transition-[width]", FILL[tone])} style={{ width: pctText(value) }} />
    </div>
  );
}

/**
 * Dải mở đầu mang màu thương hiệu.
 *
 * Hoạ tiết chìm là các vạch chéo 45° — lấy từ chính nét cắt xiên của chữ trong logo TCM, nên đây
 * là chi tiết CÓ GỐC chứ không phải hoa văn trang trí tuỳ ý.
 *
 * ⚠ Dải này CỐ Ý giữ nguyên màu ở cả theme sáng lẫn tối: brand-600/800 không đảo giá trị, và bản
 * thân logo cũng là một màu cố định trên mọi nền (xem public/brand/README.md). Chữ luôn trắng nên
 * tương phản không phụ thuộc theme.
 */
export function HeroBand({
  title,
  lead,
  chips,
  stats,
}: {
  title: string;
  lead?: string;
  chips: string[];
  stats: { label: string; value: string; unit?: string; ratio?: number }[];
}) {
  return (
    // ⚠ Đầu SÁNG của dải dừng ở brand-700, KHÔNG chạy tới brand-500. Đo thực tế trên trang: chữ
    // trắng 72% trên brand-500 chỉ đạt 2,61 và trên brand-600 là 3,37 — dưới ngưỡng AA 4,5, tức
    // nhãn nhỏ ở stat thứ ba (nằm đúng phần sáng nhất) sẽ mờ tịt. Trên brand-700 thì cả ba mức
    // trắng đều qua: 100% → 7,24 · 90% → 6,19 · 72% → 4,54.
    <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(115deg,var(--brand-900)_0%,var(--brand-800)_45%,var(--brand-700)_100%)] p-6 shadow-[var(--shadow-card)]">
      <div
        className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.075)_0_3px,transparent_3px_17px)]"
        aria-hidden
      />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span key={c} className="rounded-full bg-white/16 px-3 py-1 text-[11px] font-semibold text-white">
              {c}
            </span>
          ))}
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white">{title}</h1>
        {lead && <p className="mt-1 text-[13px] text-white/80">{lead}</p>}

        <div className="mt-5 grid gap-5 border-t border-white/20 pt-4 sm:grid-cols-3 sm:gap-0">
          {stats.map((s, i) => (
            <div key={s.label} className={cn("sm:px-5", i === 0 ? "sm:pl-0" : "sm:border-l sm:border-white/18")}>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-white/80">{s.label}</div>
              <div className="mt-1.5 text-[32px] font-extrabold leading-none tracking-tight text-white tabular-nums">
                {s.value}
                {s.unit && <span className="ml-1 text-[15px] font-semibold text-white/80">{s.unit}</span>}
              </div>
              {s.ratio !== undefined && (
                <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-white/22" aria-hidden>
                  <div className="h-full rounded-full bg-white" style={{ width: pctText(s.ratio) }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Thẻ "cần chú ý" — một việc xấu đang chờ xử lý.
 *
 * Mọi con số ở đây đều gom lại từ dữ liệu ĐÃ nạp sẵn cho trang, không thêm truy vấn nào. Vạch màu
 * bên trái + ô icon mang tín hiệu mức độ; CHỮ vẫn để `text-foreground` vì `--danger` trên nền tối
 * chỉ đạt 3,64 — chi tiết ở đầu file.
 */
export function AttentionCard({
  glyph,
  label,
  value,
  desc,
  tone,
  href,
}: {
  glyph: string;
  label: string;
  value: string;
  desc: string;
  tone: "danger" | "warning" | "brand";
  href?: string;
}) {
  const edge = tone === "danger" ? "border-l-danger" : tone === "warning" ? "border-l-warning" : "border-l-brand-500";
  // Ký hiệu để `text-foreground` chứ KHÔNG tô theo tone: đo được ◷ trên nền brand-50 chỉ đạt 2,31
  // ở theme tối và ! trên nền warning-bg đạt 3,07 ở theme sáng. Sắc thái vẫn nhận ra được qua NỀN
  // ô và vạch màu bên trái — hai chỗ đó không mang chữ nên không vướng ngưỡng tương phản.
  const chip = tone === "danger" ? "bg-danger-bg" : tone === "warning" ? "bg-warning-bg" : "bg-brand-50";
  const body = (
    <>
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[15px] font-extrabold text-foreground", chip)} aria-hidden>
        {glyph}
      </span>
      <span className="min-w-0">
        <span className={cn("block", CAP)}>{label}</span>
        <span className="mt-0.5 block text-lg font-extrabold tabular-nums tracking-tight text-foreground">{value}</span>
        <span className={cn("mt-0.5 block text-[11px] leading-snug", SUB)}>{desc}</span>
      </span>
    </>
  );
  const shell = cn(CARD, "flex items-start gap-3 border-l-4 p-4", edge);
  // ⚠ TUYỆT ĐỐI không thêm `transition-colors` vào thẻ này. Nền thẻ lấy từ biến `--surface`, mà
  // biến đó ĐỔI GIÁ TRỊ khi chuyển sáng/tối; gắn transition lên `background-color` thì trình duyệt
  // không tính lại nền theo biến mới nữa — thẻ bị KẸT ở màu của lần vẽ đầu tiên. Đã đo tận nơi:
  // bản dev kẹt màu sáng ở cả hai theme, bản build kẹt màu tối ở cả hai theme, trong khi mọi thẻ
  // khác (không có transition) đổi đúng. Hover đổi nền tức thì, không có hiệu ứng mờ dần — chấp nhận.
  return href ? (
    <Link href={href} className={cn(shell, "hover:bg-surface-2")}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/** Tiêu đề khối — vạch brand bên trái là chỗ duy nhất màu logo xuất hiện ở cấp bố cục. */
export function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="h-4 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden />
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/**
 * Số tỷ lệ "cần chú ý / tổng" — cả 2 nửa là link riêng dẫn tới danh sách đã lọc đúng.
 * Thứ bậc đọc bằng CỠ CHỮ (nửa chú ý to, nửa tổng nhỏ + xám) chứ không bằng màu, để còn giữ
 * màu cho việc báo động. Khi thiếu href → render text tĩnh, KHÔNG tạo link giả.
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
  featured,
}: {
  icon?: Icon;
  label: string;
  attention: number;
  total: number;
  attentionHref?: string;
  totalHref?: string;
  tone?: Tone;
  locale: Locale;
  sub?: string;
  /** Thẻ chính — nổi khối hơn nhờ đổ bóng sâu, dùng khi thẻ đặt trên nền khối có sắc. */
  featured?: boolean;
}) {
  const num = formatNumber(attention, locale);
  const tot = formatNumber(total, locale);
  return (
    <div className={cn(CARD, "p-5", featured && "shadow-[var(--shadow-lift)]")}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {IconComp && <IconComp className="h-3.5 w-3.5 shrink-0" />}
        <span className={CAP}>{label}</span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5 tabular-nums">
        {attentionHref ? (
          <Link href={attentionHref} className={cn("text-3xl font-bold hover:underline", TEXT[tone])}>
            {num}
          </Link>
        ) : (
          <span className={cn("text-3xl font-bold", TEXT[tone])}>{num}</span>
        )}
        <span className="text-base font-medium text-muted-foreground">/</span>
        {totalHref ? (
          <Link href={totalHref} className="text-base font-semibold text-muted-foreground hover:text-foreground hover:underline">
            {tot}
          </Link>
        ) : (
          <span className="text-base font-semibold text-muted-foreground">{tot}</span>
        )}
      </div>

      <Bar value={share(attention, total)} tone={tone} className="mt-3" />
      {sub && <p className={cn("mt-2 text-[11px] leading-snug", SUB)}>{sub}</p>}
    </div>
  );
}

/** Số đơn (đếm hoặc tiền) có màu + link tùy chọn — dùng cho card không có mẫu số. */
export function StatValue({
  icon: IconComp,
  label,
  value,
  href,
  sub,
  tone = "foreground",
  featured,
}: {
  icon?: Icon;
  label: string;
  value: string;
  href?: string;
  sub?: string;
  tone?: "foreground" | Tone;
  featured?: boolean;
}) {
  const valueTone = tone === "foreground" || tone === "brand" ? "text-foreground" : TEXT[tone];
  return (
    <div className={cn(CARD, "p-5", featured && "shadow-[var(--shadow-lift)]")}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {IconComp && <IconComp className="h-3.5 w-3.5 shrink-0" />}
        <span className={CAP}>{label}</span>
      </div>
      {href ? (
        <Link href={href} className={cn("mt-3 block text-3xl font-bold tabular-nums hover:underline", valueTone)}>
          {value}
        </Link>
      ) : (
        <div className={cn("mt-3 text-3xl font-bold tabular-nums", valueTone)}>{value}</div>
      )}
      {sub && <p className={cn("mt-2 text-[11px] leading-snug", SUB)}>{sub}</p>}
    </div>
  );
}

/**
 * Một làn dòng tiền (vào hoặc ra). Thanh tỷ lệ so ĐÃ phát sinh với TỔNG dự kiến của tháng
 * (đã + sẽ) — hai khối luôn cộng lại đúng 100%, nên nhìn phát biết tháng đã đi được bao xa.
 * KHÔNG suy ra số mới nào: mọi con số trên thanh đều là số đang hiện ngay phía trên.
 */
export function CashLane({
  icon: IconComp,
  title,
  tone,
  rows,
  note,
}: {
  icon?: Icon;
  title: string;
  tone: "success" | "danger";
  /** Đúng 2 dòng, thứ tự [đã phát sinh, còn lại] — cũng là thứ tự khối trên thanh tỷ lệ. */
  rows: [{ label: string; value: string; amount: number }, { label: string; value: string; amount: number }];
  note?: string;
}) {
  const total = rows.reduce((s, r) => s + Math.max(0, r.amount), 0);
  return (
    <div className={cn(CARD, "p-5")}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {IconComp && <IconComp className="h-3.5 w-3.5 shrink-0" />}
        <span className={CAP}>{title}</span>
      </div>

      {/* Cả hai dòng tiền đều `text-foreground` — đúng quy ước ở đầu file. Tô dòng đầu bằng
          success/danger nhìn thì hợp lý nhưng đo ra 3,30 (xanh lá trên nền trắng) và 3,64 (đỏ trên
          nền tối), đều dưới AA. Việc phân biệt vào/ra đã có tiêu đề làn và thanh tỷ lệ màu lo. */}
      <dl className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd className="text-lg font-bold tabular-nums text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden>
        <div className={FILL[tone]} style={{ width: pctText(share(rows[0].amount, total)) }} />
        <div className={cn(FILL[tone], "opacity-35")} style={{ width: pctText(share(rows[1].amount, total)) }} />
      </div>

      {/* Chữ `text-foreground` chứ KHÔNG `text-warning`: cặp warning-on-warning-bg chỉ đạt 3,07 ở
          theme sáng (dưới AA). Dùng lại biến thể đã có ở clients/[id]/kb/page.tsx — nền + viền +
          icon vàng vẫn giữ nguyên tín hiệu cảnh báo, phần CHỮ thì đọc được. */}
      {note && (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning-bg px-2.5 py-1.5 text-[11px] font-medium leading-snug text-foreground">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * Một dòng tiến độ bộ phận. Mức nghiêm trọng hiện ra bằng BA đường song song (số, %, chiều dài
 * thanh) chứ không chỉ bằng màu đỏ — `--danger` không đổi giá trị ở dark mode nên chỉ dựa vào
 * màu là mất tín hiệu đúng lúc cần nhất.
 */
export function ProgressRow({
  label,
  overdue,
  total,
  overdueHref,
  totalHref,
  locale,
  emptyText,
  highlight,
}: {
  label: string;
  overdue: number;
  total: number;
  overdueHref?: string;
  totalHref?: string;
  locale: Locale;
  /** Hiện khi bộ phận không có task nào đang mở — tránh để "0 / 0" trông như lỗi. */
  emptyText: string;
  highlight?: boolean;
}) {
  const ratio = share(overdue, total);
  const bad = overdue > 0;
  const num = formatNumber(overdue, locale);
  const tot = formatNumber(total, locale);
  return (
    // Mỗi dòng là một thẻ ĐỘC LẬP, không dùng mẹo "gap-px trên nền bg-border" để vẽ đường kẻ:
    // mẹo đó chỉ đẹp khi số ô chia hết cho số cột. Account staff chỉ thấy ĐÚNG 1 bộ phận, và
    // 1 ô trong lưới 4 cột sẽ để lộ 3/4 chiều ngang là một mảng xám đặc.
    <li className={cn(CARD, "px-4 py-3", highlight && "border-brand-300 bg-brand-50")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-semibold text-foreground">{label}</span>
        {total === 0 ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">{emptyText}</span>
        ) : (
          <span className="shrink-0 text-sm tabular-nums">
            {overdueHref ? (
              <Link href={overdueHref} className={cn("font-bold hover:underline", bad ? "text-danger" : "text-foreground")}>
                {num}
              </Link>
            ) : (
              <span className={cn("font-bold", bad ? "text-danger" : "text-foreground")}>{num}</span>
            )}
            <span className="text-muted-foreground">
              {" / "}
              {totalHref ? (
                <Link href={totalHref} className="hover:text-foreground hover:underline">
                  {tot}
                </Link>
              ) : (
                tot
              )}
            </span>
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Bar value={ratio} tone="danger" />
        <span className={cn("w-9 shrink-0 text-right text-[11px] tabular-nums", bad ? "font-semibold text-danger" : "text-muted-foreground")}>
          {total === 0 ? "—" : pctText(ratio)}
        </span>
      </div>
    </li>
  );
}
