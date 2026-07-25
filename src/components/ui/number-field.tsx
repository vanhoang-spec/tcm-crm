"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Ô nhập số hiển thị LUÔN 1.000.000 — cùng chuẩn với formatNumber() bên lib/utils.ts.
 *
 * `<input type="number">` native KHÔNG hiển thị được dấu ngăn nghìn (spec HTML: value phải là
 * floating-point number hợp lệ, "1.000.000" không hợp lệ nên trình duyệt trả về rỗng). Giải pháp
 * giống DateField: 1 ô text hiển thị có ngăn nghìn + 1 input ẩn giữ số thô để submit — action
 * server nhận đúng chuỗi số như trước, không phải sửa gì.
 *
 * Hai chế độ:
 *  - FORM  : truyền `name` → có input ẩn, submit qua FormData như cũ.
 *  - ĐIỀU KHIỂN: truyền `onChange` → nhận number, không cần input ẩn.
 * Truyền cả hai cũng được (lưới CO/CE vừa giữ state vừa submit).
 *
 * `decimals`: 0 = tiền/đơn giá/thành tiền (mặc định). >0 = số lượng, %, giờ công — cho gõ dấu phẩy.
 * Số ÂM được phép (CO/CE có dòng giảm trừ — xem HANDOVER mục 6).
 */

const GROUP = "."; // ngăn nghìn
const DECIMAL = ","; // dấu thập phân

/** Số → chuỗi hiển thị. Cắt số 0 thừa ở đuôi phần thập phân. */
function toDisplay(value: number | string | null | undefined, decimals: number): string {
  if (value === "" || value == null) return "";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(n);
}

/** Chuỗi người dùng gõ → chuỗi số thô ("-1234.5") để submit/parse. "" nếu chưa có số nào. */
function toRaw(display: string, decimals: number): string {
  const neg = display.trim().startsWith("-");
  let body = display.replace(/-/g, "");
  body = body.split(GROUP).join(""); // bỏ ngăn nghìn
  if (decimals > 0) {
    const parts = body.split(DECIMAL);
    const int = parts[0].replace(/\D/g, "");
    const frac = (parts[1] ?? "").replace(/\D/g, "").slice(0, decimals);
    body = parts.length > 1 ? `${int}.${frac}` : int;
  } else {
    body = body.replace(/\D/g, "");
  }
  if (body === "" || body === ".") return "";
  return (neg ? "-" : "") + body;
}

/** Chuẩn hoá lại chuỗi hiển thị, GIỮ dấu thập phân người dùng đang gõ dở ("12," không bị nuốt). */
function normalizeDisplay(display: string, decimals: number): string {
  const raw = toRaw(display, decimals);
  if (raw === "") return display.trim().startsWith("-") ? "-" : "";
  // Người dùng đang gõ dở phần thập phân ("12," hoặc "12,3") — giữ nguyên dấu phẩy, đừng nuốt mất.
  const trailing = decimals > 0 && new RegExp(`\\${DECIMAL}\\d*$`).test(display);
  const [int, frac] = raw.replace("-", "").split(".");
  const neg = raw.startsWith("-") ? "-" : "";
  const grouped = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(int || 0));
  if (decimals > 0 && (frac !== undefined || trailing)) return `${neg}${grouped}${DECIMAL}${frac ?? ""}`;
  return `${neg}${grouped}`;
}

const countDigits = (s: string) => (s.match(/\d/g) ?? []).length;

export function NumberField({
  name,
  value,
  defaultValue,
  onChange,
  decimals = 0,
  className,
  ...rest
}: {
  /** Có name → sinh input ẩn submit qua FormData (giữ nguyên tên field cũ). */
  name?: string;
  /** Chế độ điều khiển: số hiện tại. */
  value?: number | string | null;
  /** Chế độ form không điều khiển: giá trị khởi tạo. */
  defaultValue?: number | string | null;
  onChange?: (value: number) => void;
  decimals?: number;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "name">) {
  const controlled = value !== undefined;
  const [display, setDisplay] = useState(() => toDisplay(controlled ? value : defaultValue, decimals));
  const inputRef = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);

  // Chế độ điều khiển: giá trị đổi từ BÊN NGOÀI (vd bấm "Make-up" tính lại CE) thì đồng bộ lại ô.
  // Bỏ qua khi ô đang được gõ — ghi đè giữa chừng sẽ giật con trỏ và nuốt ký tự vừa nhập.
  useEffect(() => {
    if (!controlled) return;
    const el = inputRef.current;
    if (el && document.activeElement === el) return;
    const next = toDisplay(value, decimals);
    setDisplay((cur) => (cur === next ? cur : next));
  }, [controlled, value, decimals]);

  // Chèn dấu ngăn nghìn làm lệch vị trí con trỏ → đặt lại theo SỐ CHỮ SỐ đứng trước con trỏ,
  // nhờ vậy sửa được ở giữa chuỗi chứ không bị nhảy về cuối.
  useLayoutEffect(() => {
    const want = caretDigits.current;
    const el = inputRef.current;
    caretDigits.current = null;
    if (want == null || !el) return;
    let seen = 0;
    let pos = el.value.length;
    for (let i = 0; i < el.value.length; i++) {
      if (/\d/.test(el.value[i])) seen++;
      if (seen >= want) {
        pos = i + 1;
        break;
      }
    }
    el.setSelectionRange(pos, pos);
  }, [display]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    caretDigits.current = countDigits(el.value.slice(0, el.selectionStart ?? el.value.length));
    const next = normalizeDisplay(el.value, decimals);
    setDisplay(next);
    onChange?.(Number(toRaw(next, decimals) || 0));
  }

  const raw = toRaw(display, decimals);

  return (
    <>
      <input
        {...rest}
        ref={inputRef}
        type="text"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        value={display}
        onChange={handleChange}
        className={cn("tabular-nums", className)}
      />
      {name && <input type="hidden" name={name} value={raw} />}
    </>
  );
}
