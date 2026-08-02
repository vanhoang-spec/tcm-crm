"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/** Ô chọn năm dùng chung cho cả 3 tab — giữ nguyên pathname, chỉ đổi `?year=`. */
export function YearPicker({ years, current }: { years: number[]; current: number }) {
  const t = useTranslations("overhead");
  const pathname = usePathname();
  const list = years.includes(current) ? years : [current, ...years];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">{t("year")}</span>
      {list.map((y) => (
        <Link
          key={y}
          href={`${pathname}?year=${y}`}
          className={`rounded-md px-2 py-1 text-[11px] ${y === current ? "bg-brand-600 text-white" : "border border-border-strong text-foreground hover:bg-surface-2"}`}
        >
          {y}
        </Link>
      ))}
    </div>
  );
}
