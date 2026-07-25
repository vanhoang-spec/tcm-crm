import { prisma } from "@/lib/prisma";
import { getStringSetting } from "@/lib/settings";
import { checkPasswordAge, hashPassword, needsRehash, verifyPassword } from "@/lib/password";
import { LOCKOUT_MINUTES, MAX_FAILED_LOGINS } from "@/lib/auth-session";

/**
 * Nghiệp vụ đăng nhập — tách khỏi server action để test được và để action chỉ lo form/i18n.
 */

/** Mật khẩu chung cấp cho nhân sự mới / khi admin cấp lại. Admin đổi được ở /settings/security. */
export async function getDefaultPassword(): Promise<string> {
  return getStringSetting("auth", "default_password", "TCM123456");
}

export type LoginFailure =
  | "INVALID_CREDENTIALS" // sai email hoặc sai mật khẩu — cố ý gộp chung, không tiết lộ email nào tồn tại
  | "LOCKED"
  | "INACTIVE";

export type LoginResult =
  | { ok: true; staffId: string; mustChangePassword: boolean }
  | { ok: false; reason: LoginFailure; lockedMinutes?: number };

/**
 * Kiểm tra email + mật khẩu.
 *
 * Nhân sự chưa từng đặt mật khẩu (`passwordHash` null) được đăng nhập bằng mật khẩu chung, và bị
 * ép đổi ngay sau đó (`mustChangePassword`). Mật khẩu quá 12 tháng cũng trả `mustChangePassword`.
 */
export async function attemptLogin(email: string, password: string): Promise<LoginResult> {
  const staff = await prisma.staff.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: {
      id: true, isActive: true, passwordHash: true, passwordChangedAt: true,
      mustChangePassword: true, failedLoginCount: true, lockedUntil: true,
    },
  });

  // Vẫn tốn thời gian băm khi email không tồn tại để thời gian phản hồi không lộ email nào có thật.
  if (!staff) {
    verifyPassword(password, hashPassword("dummy-timing-equalizer"));
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }
  if (!staff.isActive) return { ok: false, reason: "INACTIVE" };

  const now = new Date();
  if (staff.lockedUntil && staff.lockedUntil > now) {
    return { ok: false, reason: "LOCKED", lockedMinutes: Math.ceil((staff.lockedUntil.getTime() - now.getTime()) / 60_000) };
  }

  const usingDefault = !staff.passwordHash;
  const okPassword = usingDefault
    ? password === (await getDefaultPassword())
    : verifyPassword(password, staff.passwordHash);

  if (!okPassword) {
    const failed = staff.failedLoginCount + 1;
    await prisma.staff.update({
      where: { id: staff.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    return failed >= MAX_FAILED_LOGINS
      ? { ok: false, reason: "LOCKED", lockedMinutes: LOCKOUT_MINUTES }
      : { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  // Đăng nhập đúng: xoá bộ đếm sai, ghi mốc đăng nhập, nâng cấp hash nếu tham số băm đã cũ.
  const expired = checkPasswordAge(staff.passwordChangedAt, now).expired;
  await prisma.staff.update({
    where: { id: staff.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: now,
      ...(!usingDefault && needsRehash(staff.passwordHash) ? { passwordHash: hashPassword(password) } : {}),
    },
  });

  return { ok: true, staffId: staff.id, mustChangePassword: usingDefault || staff.mustChangePassword || expired };
}

/** true nếu nhân sự này đang bị buộc đổi mật khẩu (lần đầu, admin cấp lại, hoặc quá 12 tháng). */
export async function needsPasswordChange(staffId: string): Promise<boolean> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { passwordHash: true, passwordChangedAt: true, mustChangePassword: true },
  });
  if (!staff) return false;
  if (!staff.passwordHash || staff.mustChangePassword) return true;
  return checkPasswordAge(staff.passwordChangedAt).expired;
}

/** Đặt mật khẩu mới + gỡ mọi cờ ép đổi. Dùng chung cho đổi tự nguyện, ép đổi, và đặt lại qua link. */
export async function setStaffPassword(staffId: string, newPassword: string): Promise<void> {
  await prisma.staff.update({
    where: { id: staffId },
    data: {
      passwordHash: hashPassword(newPassword),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
}
