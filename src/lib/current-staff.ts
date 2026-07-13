import { prisma } from "@/lib/prisma";

/**
 * TODO(auth): thay bằng session thật khi có đăng nhập.
 * Tạm thời trả về CEO seed để mọi hành động ghi audit_log có changedBy hợp lệ.
 */
export async function getCurrentStaffId(): Promise<string | null> {
  const ceo = await prisma.staff.findUnique({ where: { email: "ceo@tcm.vn" } });
  return ceo?.id ?? null;
}
