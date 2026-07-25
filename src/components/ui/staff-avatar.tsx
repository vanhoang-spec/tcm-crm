import { cn, initials } from "@/lib/utils";

/** Avatar nhân sự — ảnh thật (đổi ở /profile) hoặc rơi về initials khi chưa có ảnh. */
export function StaffAvatar({
  staffId,
  avatarKey,
  fullName,
  updatedAt,
  size = "h-8 w-8",
  textSize = "text-xs",
  className,
}: {
  staffId: string;
  avatarKey?: string | null;
  fullName?: string | null;
  updatedAt?: Date | string | null; // cache-busting khi user vừa đổi ảnh
  size?: string;
  textSize?: string;
  className?: string;
}) {
  if (avatarKey) {
    const v = updatedAt ? new Date(updatedAt).getTime() : "";
    return (
      // eslint-disable-next-line @next/next/no-img-element -- ảnh phục vụ qua route có auth, không tối ưu qua next/image được
      <img
        src={`/api/staff-avatar/${staffId}${v ? `?v=${v}` : ""}`}
        alt={fullName ?? ""}
        className={cn("shrink-0 rounded-full object-cover", size, className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700",
        size,
        textSize,
        className,
      )}
    >
      {initials(fullName)}
    </span>
  );
}
