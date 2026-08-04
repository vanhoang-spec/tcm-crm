import { cn } from "@/lib/utils";

/*
 * Hai biểu đồ của Dashboard. Dựng bằng HTML/CSS chứ KHÔNG phải SVG và KHÔNG phải thư viện biểu đồ:
 *   • repo chưa có thư viện biểu đồ nào — thêm một cái chỉ để vẽ 2 hình là đổi hẳn kích thước bundle;
 *   • SVG có viewBox thì chữ bên trong bị co giãn theo khung, còn HTML thì chữ luôn nét;
 *   • lớp hover làm bằng CSS thuần (`group-hover`), nên cả file này VẪN là server component —
 *     không tốn một byte JS nào gửi xuống trình duyệt.
 *
 * ⚠ Màu lấy từ --chart-1/2/3 (globals.css) đã qua bộ kiểm mù màu. Đừng thay bằng success/danger:
 *   lý do ghi ngay tại chỗ khai báo biến.
 *
 * Quy cách nét theo chuẩn dataviz: cột dày ≤ 24px, bo 4px ở ĐẦU DỮ LIỆU và vuông ở đường gốc,
 * khe hở 2px màu nền giữa các mảnh chồng nhau, lưới/trục là nét mảnh 1px chìm, chú giải luôn có
 * khi ≥ 2 chuỗi, và CHỮ KHÔNG BAO GIỜ mang màu của chuỗi (màu chỉ nằm ở ô vuông chú giải).
 */

/** Ô vuông chú giải — kênh nhận diện đi kèm chữ, để không bắt người đọc dò theo màu. */
function Swatch({ className }: { className: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]", className)} aria-hidden />;
}

function Legend({ items }: { items: { color: string; label: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-[11px] text-foreground/70">
          <Swatch className={it.color} />
          <span>{it.label}</span>
          {it.value && <span className="font-semibold tabular-nums text-foreground">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Hộp chú thích hiện khi rê chuột. Nằm trong `.group` của từng mốc. */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] leading-relaxed shadow-[var(--shadow-card)] group-hover:block"
    >
      {children}
    </div>
  );
}

export type TrendColumn = {
  /** Nhãn trục ngang, vd "T7". */
  label: string;
  /** Nhãn đầy đủ cho tooltip, vd "Tháng 7/2026". */
  fullLabel: string;
  inActual: number;
  outActual: number;
  inText: string;
  outText: string;
};

/**
 * Cột PHÂN KỲ thu/chi: tiền vào mọc LÊN, tiền ra mọc XUỐNG từ cùng một đường gốc.
 *
 * Chọn hình này thay vì hai đường kẻ chồng nhau vì VỊ TRÍ (trên/dưới) đã mang thông tin "vào hay
 * ra" — người mù màu vẫn đọc đúng kể cả khi hai màu trông giống nhau. Hai nửa dùng CHUNG một thang
 * đo (`max` của cả hai chuỗi) nên chiều cao so sánh được trực tiếp; đây KHÔNG phải biểu đồ hai trục.
 */
export function CashTrendChart({
  columns,
  inLabel,
  outLabel,
  emptyNote,
  peakText,
}: {
  columns: TrendColumn[];
  inLabel: string;
  outLabel: string;
  /** Hiện khi số tháng có phát sinh quá ít để thành xu hướng — nói thẳng thay vì vẽ hình rỗng. */
  emptyNote?: string;
  /** Nhãn trực tiếp cho cột cao nhất. Chỉ gắn MỘT nhãn: dán số lên mọi cột là không ai đọc. */
  peakText?: string;
}) {
  const max = Math.max(1, ...columns.map((c) => Math.max(c.inActual, c.outActual)));
  const peak = columns.reduce((best, c) => (Math.max(c.inActual, c.outActual) > Math.max(best.inActual, best.outActual) ? c : best), columns[0]);
  const hasAny = columns.some((c) => c.inActual > 0 || c.outActual > 0);

  return (
    <div>
      <Legend items={[{ color: "bg-chart-1", label: inLabel }, { color: "bg-chart-2", label: outLabel }]} />

      <div className="mt-3 flex items-stretch gap-1.5">
        {columns.map((c) => {
          const isPeak = hasAny && c.label === peak.label;
          return (
            <div key={c.label} className="group relative flex flex-1 flex-col items-center">
              <Tip>
                <div className="font-semibold text-foreground">{c.fullLabel}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Swatch className="bg-chart-1" />
                  <span className="text-foreground/70">{inLabel}</span>
                  <span className="font-semibold tabular-nums text-foreground">{c.inText}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Swatch className="bg-chart-2" />
                  <span className="text-foreground/70">{outLabel}</span>
                  <span className="font-semibold tabular-nums text-foreground">{c.outText}</span>
                </div>
              </Tip>

              {/* Nửa trên — tiền vào. Bo 4px ở đỉnh (đầu dữ liệu), vuông ở đáy (đường gốc). */}
              <div className="flex h-16 w-full items-end justify-center rounded-md px-0.5 group-hover:bg-surface-2">
                <div
                  className="w-full max-w-[22px] rounded-t-[4px] bg-chart-1"
                  style={{ height: `${(c.inActual / max) * 100}%` }}
                />
              </div>

              <div className="h-px w-full bg-border-strong" aria-hidden />

              {/* Nửa dưới — tiền ra. Bo 4px ở đáy, vuông ở đường gốc. */}
              <div className="flex h-10 w-full items-start justify-center rounded-md px-0.5 group-hover:bg-surface-2">
                <div
                  className="w-full max-w-[22px] rounded-b-[4px] bg-chart-2"
                  style={{ height: `${(c.outActual / max) * 100}%` }}
                />
              </div>

              <span className={cn("mt-1.5 text-[10px] tabular-nums", isPeak ? "font-semibold text-foreground" : "text-foreground/65")}>
                {c.label}
              </span>
            </div>
          );
        })}
      </div>

      {isFinite(max) && hasAny && peakText && (
        <p className="mt-2 text-[11px] text-foreground/65">{peakText}</p>
      )}
      {emptyNote && (
        <p className="mt-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] leading-snug text-foreground/70">{emptyNote}</p>
      )}
    </div>
  );
}

export type StageSlice = {
  key: string;
  label: string;
  count: number;
  /** Lớp nền của mảnh, vd "bg-chart-1". */
  color: string;
  /**
   * Lớp CHỮ đặt bên trong mảnh — chọn theo độ sáng của chính nền mảnh, không chọn theo thói quen.
   * Đo được: trắng trên #0068e6 = 5,09 ✓ · trắng trên #7c3aed = 5,70 ✓ · nhưng trắng trên cam
   * #ea580c chỉ 3,56 ✗ trong khi mực đậm trên nền cam đó đạt 5,40 ✓.
   */
  textOn: string;
};

/**
 * Thanh chồng NGANG cho cơ cấu dự án — KHÔNG dùng hình tròn/donut: donut buộc người đọc so sánh
 * góc, mà so góc thì kém chính xác hơn hẳn so chiều dài, nhất là khi hai phần xấp xỉ nhau.
 *
 * Khe 2px màu nền tách các mảnh (dùng `gap`, không viền: viền là mực thừa không mang dữ liệu).
 * Nhãn chỉ đặt VÀO TRONG mảnh khi mảnh đủ rộng — chật thì để chú giải bên dưới gánh, tuyệt đối
 * không cắt cụt chữ.
 */
export function StageMixChart({ slices, totalText }: { slices: StageSlice[]; totalText: string }) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  const shown = slices.filter((s) => s.count > 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-2xl font-bold tabular-nums text-foreground">{total}</span>
        <span className="text-[11px] text-foreground/65">{totalText}</span>
      </div>

      <div className="mt-3 flex h-7 w-full gap-[2px] overflow-hidden rounded-lg bg-surface" role="img">
        {shown.length === 0 ? (
          <div className="h-full w-full rounded-lg bg-border" />
        ) : (
          shown.map((s) => {
            const pct = (s.count / total) * 100;
            // Chỉ in số vào trong mảnh khi mảnh ≥ 14% bề ngang — dưới ngưỡng đó chữ sẽ chạm mép.
            const roomy = pct >= 14;
            return (
              <div
                key={s.key}
                className={cn("group relative flex h-full items-center justify-center first:rounded-l-lg last:rounded-r-lg", s.color)}
                style={{ width: `${pct}%` }}
              >
                <Tip>
                  <span className="font-semibold text-foreground">{s.label}</span>
                  <span className="ml-1.5 tabular-nums text-foreground/70">
                    {s.count} · {Math.round(pct)}%
                  </span>
                </Tip>
                {roomy && <span className={cn("text-[11px] font-bold tabular-nums", s.textOn)}>{s.count}</span>}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-3">
        <Legend items={slices.map((s) => ({ color: s.color, label: s.label, value: String(s.count) }))} />
      </div>
    </div>
  );
}
