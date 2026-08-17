import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentStaff } from "@/lib/current-staff";
import { checkPasswordAge } from "@/lib/password";
import { StaffAvatar } from "@/components/ui/staff-avatar";
import { ProfileAvatarForm } from "./profile-avatar-form";
import { ProfileDatesForm } from "./profile-dates-form";
import { formatDate } from "@/lib/utils";

export default async function ProfilePage() {
  const [t, tAuth, me] = await Promise.all([
    getTranslations("profile"),
    getTranslations("auth.change"),
    getCurrentStaff(),
  ]);
  if (!me) return null; // layout đã chặn — chỉ để TypeScript yên tâm

  const age = checkPasswordAge(me.passwordChangedAt);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-4">
          <StaffAvatar
            staffId={me.id}
            avatarKey={me.avatarKey}
            fullName={me.fullName}
            updatedAt={me.updatedAt}
            size="h-20 w-20"
            textSize="text-2xl"
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-foreground">{me.fullName}</p>
            <p className="truncate text-sm text-muted-foreground">
              {[me.title, me.department?.name].filter(Boolean).join(" · ") || "—"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{me.email}</p>
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <ProfileAvatarForm hasAvatar={!!me.avatarKey} />
        </div>
      </div>

      {/* Thông tin cá nhân — ngày sinh / ngày đi làm đầu tiên: HR có thể để trống lúc tạo, nhân sự tự bổ sung ở đây. */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("personalTitle")}</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="w-40 shrink-0 text-xs text-muted-foreground">{t("dob")}</dt>
            <dd className="text-foreground">{me.dateOfBirth ? formatDate(me.dateOfBirth) : t("notSet")}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-40 shrink-0 text-xs text-muted-foreground">{t("firstWorkDate")}</dt>
            <dd className="text-foreground">{me.firstWorkDate ? formatDate(me.firstWorkDate) : t("notSet")}</dd>
          </div>
        </dl>
        {!me.dateOfBirth || !me.firstWorkDate ? (
          <>
            <p className="mt-3 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">{t("datesMissingHint")}</p>
            <ProfileDatesForm needDob={!me.dateOfBirth} needFirstWorkDate={!me.firstWorkDate} />
          </>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">{t("datesLockedHint")}</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{tAuth("title")}</h2>
        {age.expiringSoon && !age.expired && (
          <p className="mt-2 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
            {tAuth("expiringSoon", { days: age.daysLeft })}
          </p>
        )}
        <Link
          href="/change-password"
          className="mt-3 inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-2"
        >
          {tAuth("submit")}
        </Link>
      </div>
    </div>
  );
}
