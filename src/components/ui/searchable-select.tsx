"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Dòng phụ hiển thị mờ dưới label trong danh sách (vd chức danh, mã dự án) — cũng được tính vào search. */
  sublabel?: string;
  /** Text ẩn chỉ dùng để search, không hiển thị (vd email, số điện thoại, tên không dấu). */
  keywords?: string;
};

/** Bỏ dấu tiếng Việt để so khớp không phân biệt dấu (gõ "phuoc" vẫn ra "Phước"). */
function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function haystack(o: SearchableSelectOption): string {
  return stripDiacritics([o.label, o.sublabel, o.keywords].filter(Boolean).join(" "));
}

/** Search "thông minh": tách câu gõ thành nhiều từ, khớp AND trên label+sublabel+keywords, không phân biệt dấu/hoa-thường. */
function matches(o: SearchableSelectOption, query: string): boolean {
  const tokens = stripDiacritics(query).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = haystack(o);
  return tokens.every((t) => hay.includes(t));
}

/**
 * Dropdown chọn 1 giá trị có Ô TÌM KIẾM — thay thế `<select>` thuần cho mọi danh sách có thể dài
 * (khách hàng, dự án, nhân sự, NCC...). Search khớp nhiều trường cùng lúc (label + sublabel +
 * keywords ẩn), không phân biệt dấu tiếng Việt.
 *
 * Dùng như `<select>` thường trong form (submit qua `name` bằng input ẩn) — hỗ trợ cả 2 chế độ:
 *  - Uncontrolled (form CRUD thường): truyền `name` + `defaultValue`, đọc qua FormData như cũ.
 *  - Controlled (bộ lọc/URL searchParam): truyền `value` + `onChange`, không cần `name`.
 */
export function SearchableSelect({
  name,
  form,
  options,
  value,
  defaultValue = "",
  onChange,
  placeholder = "— Chọn —",
  searchPlaceholder,
  emptyText = "Không tìm thấy kết quả phù hợp.",
  required,
  disabled,
  hasError,
  allowClear,
  className,
}: {
  name?: string;
  /** id của <form> ngoài cây (HTML5 form= attribute) — dùng cho input ẩn khi select nằm ngoài <form>. */
  form?: string;
  options: SearchableSelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  required?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  /** Hiện nút xóa lựa chọn (đưa value về ""). Mặc định bật khi không required. */
  allowClear?: boolean;
  className?: string;
}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = isControlled ? value! : internalValue;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      searchInputRef.current?.focus();
    }
  }, [open]);

  function openDropdown() {
    setHighlight(0);
    setOpen(true);
  }

  const filtered = useMemo(() => options.filter((o) => matches(o, query)), [options, query]);
  const selectedOption = options.find((o) => o.value === selected);

  function commit(v: string) {
    if (!isControlled) setInternalValue(v);
    onChange?.(v);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) commit(filtered[highlight].value);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  const canClear = (allowClear ?? !required) && selected !== "";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} form={form} value={selected} required={required} />}
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-left text-sm outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60",
          hasError
            ? "border-danger focus:border-danger focus:ring-danger/20"
            : "border-border-strong focus:border-brand-400 focus:ring-brand-100",
        )}
      >
        <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="flex flex-none items-center gap-1">
          {canClear && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                commit("");
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <div className="relative border-b border-border">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder ?? "Tìm kiếm…"}
              className="h-9 w-full bg-transparent pl-8 pr-2 text-sm outline-none"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</li>
            ) : (
              filtered.map((o, i) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => commit(o.value)}
                    className={cn(
                      "block w-full px-3 py-1.5 text-left text-sm",
                      i === highlight ? "bg-brand-50 text-brand-700" : "text-foreground hover:bg-surface-2",
                      o.value === selected && "font-medium",
                    )}
                  >
                    <span className="block truncate">{o.label}</span>
                    {o.sublabel && <span className="block truncate text-xs text-muted-foreground">{o.sublabel}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
