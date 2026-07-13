import Image from "next/image";
import { cn } from "@/lib/utils";

// Nguồn: Source/TCM_logo_vector.png (2026-07-13) — đã trim/tách thành
// public/brand/{logo,mark,icon-square}.png, xem public/brand/README.md.
const MARK_RATIO = 738 / 2189; // height / width của mark.png

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  if (compact) {
    return (
      <Image
        src="/brand/icon-square.png"
        alt="TCM"
        width={32}
        height={32}
        className={cn("shrink-0", className)}
        priority
      />
    );
  }

  const width = 108;
  return (
    <Image
      src="/brand/mark.png"
      alt="TCM — Targeted Marketing"
      width={width}
      height={Math.round(width * MARK_RATIO)}
      className={cn("shrink-0", className)}
      priority
    />
  );
}
