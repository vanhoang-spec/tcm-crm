import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedStaffId } from "@/lib/auth-session";

/**
 * Danh tính người dùng hiện tại.
 *
 * Từ khi có đăng nhập thật (xem auth-session.ts), file này KHÔNG còn fallback "không cookie = CEO".
 * Chưa đăng nhập → `getCurrentStaffId()` trả null, và lớp guard ở `(app)/layout.tsx` sẽ đẩy về /login.
 *
 * "Act as" (mạo danh) vẫn giữ nhưng đổi vai: chỉ tài khoản role ADMIN mới dùng được, phục vụ hỗ trợ
 * và kiểm thử. Người thường có cookie act-as (còn sót từ trước) cũng bị bỏ qua.
 */

export const ACT_AS_COOKIE = "tcm_act_as";
const SECRET = process.env.ACT_AS_SECRET ?? "tcm-dev-actas-secret-change-in-prod";

export const ACT_AS_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 ngày
};

export function signActAs(staffId: string): string {
  const sig = createHmac("sha256", SECRET).update(staffId).digest("hex");
  return `${staffId}.${sig}`;
}

function verifyActAs(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const staffId = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = createHmac("sha256", SECRET).update(staffId).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return staffId;
}

/** Đọc staffId đang "act as" từ cookie (đã verify chữ ký + còn active). Chưa xét quyền ở đây. */
async function readActAsStaffId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(ACT_AS_COOKIE)?.value;
  if (!raw) return null;
  const staffId = verifyActAs(raw);
  if (!staffId) return null;
  const staff = await prisma.staff.findFirst({ where: { id: staffId, isActive: true }, select: { id: true } });
  return staff?.id ?? null;
}

/** true nếu nhân sự này giữ role ADMIN (điều kiện duy nhất để được mạo danh người khác). */
export async function isAdminStaff(staffId: string): Promise<boolean> {
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { role: { select: { code: true } } } });
  return staff?.role?.code === "ADMIN";
}

/**
 * staffId đang thao tác. Bằng người đăng nhập, TRỪ KHI người đó là ADMIN và đang mạo danh người khác.
 * Null = chưa đăng nhập → caller (layout guard) chịu trách nhiệm chuyển về /login.
 */
export async function getCurrentStaffId(): Promise<string | null> {
  const authed = await getAuthenticatedStaffId();
  if (!authed) return null;

  const acted = await readActAsStaffId();
  if (acted && acted !== authed && (await isAdminStaff(authed))) return acted;
  return authed;
}

/** Trả nhân sự hiện tại (id + tên + chức danh + phòng ban) — dùng cho header/chat. */
export async function getCurrentStaff() {
  const id = await getCurrentStaffId();
  if (!id) return null;
  return prisma.staff.findUnique({
    where: { id },
    include: { department: true },
  });
}

/**
 * Thông tin phiên cho header: ai đang đăng nhập thật, có đang mạo danh không.
 * Dùng để hiện nhãn "Đang xem với tư cách …" và ẩn/hiện act-as switcher.
 */
export async function getSessionContext() {
  const authed = await getAuthenticatedStaffId();
  if (!authed) return null;
  const isAdmin = await isAdminStaff(authed);
  const acted = isAdmin ? await readActAsStaffId() : null;
  const impersonating = !!acted && acted !== authed;
  return { authenticatedStaffId: authed, effectiveStaffId: impersonating ? acted! : authed, isAdmin, impersonating };
}
