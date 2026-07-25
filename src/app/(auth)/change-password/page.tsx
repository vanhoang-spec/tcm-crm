import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedStaffId } from "@/lib/auth-session";
import { checkPasswordAge } from "@/lib/password";
import { ChangePasswordForm } from "./change-form";

/**
 * Ép đổi mật khẩu. Nằm trong route group (auth) chứ không phải (app): người chưa đổi mật khẩu
 * KHÔNG được thấy sidebar/dữ liệu — đây là chốt chặn, không phải lời nhắc.
 */
export default async function ChangePasswordPage() {
  const staffId = await getAuthenticatedStaffId();
  if (!staffId) redirect("/login");

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { passwordHash: true, passwordChangedAt: true, mustChangePassword: true },
  });
  if (!staff) redirect("/login");

  const expired = checkPasswordAge(staff.passwordChangedAt).expired;
  const firstLogin = !staff.passwordHash;
  const forced = firstLogin || staff.mustChangePassword || expired;

  const reason = firstLogin ? "firstLogin" : expired && !staff.mustChangePassword ? "expired" : "reset";

  return <ChangePasswordForm forced={forced} reason={reason} />;
}
