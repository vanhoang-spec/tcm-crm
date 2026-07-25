"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Input ngày hiển thị LUÔN dd/mm/yyyy — bất kể locale hệ điều hành/trình duyệt của user.
 *
 * `<input type="date">` native không thể ép format hiển thị: Chromium bỏ qua `lang`/`html[lang]`,
 * chỉ theo locale OS/browser — đây là giới hạn không sửa được bằng CSS/props (đã audit toàn app).
 * Giải pháp: 1 ô text hiển thị (mask dd/mm/yyyy, gõ tay được) + 1 input type="date" ẩn tuyệt đối
 * (kích thước 1x1px, KHÔNG display:none để giữ đủ điều kiện validate + showPicker()) làm (a) nơi
 * thật sự submit trong form (giữ nguyên `name`, tương thích 100% các action server hiện có vì value
 * vẫn là chuỗi ISO yyyy-mm-dd y hệt input date gốc) và (b) nơi mở lịch chọn ngày gốc của trình duyệt
 * qua nút icon. Hai chiều đồng bộ: gõ tay → tính lại ISO; chọn lịch → tính lại hiển thị.
 */

function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function maskDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}

function displayToIso(display: string): string {
  const digits = display.replace(/\D/g, "");
  if (digits.length !== 8) return "";
  const d = Number(digits.slice(0, 2));
  const mo = Number(digits.slice(2, 4));
  const y = Number(digits.slice(4, 8));
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1000) return "";
  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

export function DateField({
  name,
  defaultValue,
  className,
  required,
  disabled,
  form,
  id,
  title,
  "aria-label": ariaLabel,
  onChange,
}: {
  name: string;
  defaultValue?: string | null; // ISO yyyy-mm-dd, giống hệt defaultValue của input type="date" cũ
  className?: string;
  required?: boolean;
  disabled?: boolean;
  form?: string; // mirror thuộc tính HTML form= (submit vào <form> ngoài, xem timeline-editor.tsx)
  id?: string;
  title?: string;
  "aria-label"?: string;
  onChange?: () => void; // gọi khi giá trị đổi (gõ tay hoặc chọn lịch) — dùng cho dirty-tracking
}) {
  const [iso, setIso] = useState(defaultValue ?? "");
  const [display, setDisplay] = useState(isoToDisplay(defaultValue ?? ""));

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskDisplay(e.target.value);
    setDisplay(masked);
    setIso(displayToIso(masked));
    onChange?.();
  }

  function handlePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextIso = e.target.value;
    setIso(nextIso);
    setDisplay(isoToDisplay(nextIso));
    onChange?.();
  }

  function openPicker(e: React.MouseEvent<HTMLButtonElement>) {
    const picker = e.currentTarget.parentElement?.querySelector<HTMLInputElement>('input[type="date"]');
    if (!picker) return;
    if (typeof picker.showPicker === "function") {
      try {
        picker.showPicker();
        return;
      } catch {
        // một số trình duyệt chặn showPicker() ngoài user-gesture trực tiếp — fallback focus bên dưới
      }
    }
    picker.focus();
  }

  return (
    <span className="relative inline-flex w-full">
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        value={display}
        onChange={handleTextChange}
        disabled={disabled}
        id={id}
        title={title}
        aria-label={ariaLabel}
        className={cn(className, "pr-6")}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        disabled={disabled}
        aria-label="Chọn ngày"
        className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        <CalendarDays className="h-3.5 w-3.5" />
      </button>
      {/* Input thật sự tham gia submit form — 1x1px, không display:none (giữ validate + showPicker hoạt động) */}
      <input
        type="date"
        name={name}
        form={form}
        required={required}
        disabled={disabled}
        value={iso}
        onChange={handlePickerChange}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute h-px w-px overflow-hidden opacity-0"
      />
    </span>
  );
}
