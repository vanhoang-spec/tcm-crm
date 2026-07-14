"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Input tự do có gợi ý tìm kiếm từ danh sách có sẵn — KHÔNG ràng buộc chỉ chọn trong
 * danh sách. Nếu gõ giá trị chưa tồn tại, submit bình thường như text; nơi nhận
 * (server action) chịu trách nhiệm tạo mới (vd upsert-by-name cho Brand).
 */
export function Combobox({
  name,
  options,
  defaultValue = "",
  placeholder,
  required,
  hasError,
  newItemLabel,
}: {
  name: string;
  options: string[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  hasError?: boolean;
  newItemLabel: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = options.filter((o) => o.toLowerCase().includes(value.trim().toLowerCase()));
  const exactMatch = options.some((o) => o.toLowerCase() === value.trim().toLowerCase());
  const showCreateHint = value.trim().length > 0 && !exactMatch;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          name={name}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className={cn(
            "h-10 w-full rounded-lg border bg-surface px-3 pr-8 text-sm outline-none focus:ring-2",
            hasError
              ? "border-danger focus:border-danger focus:ring-danger/20"
              : "border-border-strong focus:border-brand-400 focus:ring-brand-100",
          )}
        />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {open && (filtered.length > 0 || showCreateHint) && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-surface py-1 shadow-lg">
          {filtered.map((o) => (
            <li key={o}>
              <button
                type="button"
                onClick={() => {
                  setValue(o);
                  setOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-surface-2"
              >
                {o}
              </button>
            </li>
          ))}
          {showCreateHint && (
            <li>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-1.5 border-t border-border px-3 py-1.5 text-left text-sm text-brand-600 hover:bg-surface-2"
              >
                <Plus className="h-3.5 w-3.5" />
                {newItemLabel}: &ldquo;{value.trim()}&rdquo;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
