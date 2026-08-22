import "server-only";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { canOpenCandidate, canSeeExpectedSalary } from "@/lib/recruit";

/**
 * Lớp kiểm quyền của sub-module Tuyển dụng.
 *
 * Có HAI tầng, cố ý:
 *  (1) MÃ QUYỀN — cho HR và BGĐ, đọc từ ma trận như mọi module khác.
 *  (2) THEO BẢN GHI — cho người phỏng vấn được phân công, cho trưởng bộ phận và cho người quản lý
 *      trực tiếp của CHÍNH vị trí đang tuyển. Ma trận quyền của app là phẳng toàn cục nên không
 *      diễn đạt được ba vai này; cùng cách đã dùng để duyệt đề xuất kho theo PIC dự án.
 *
 * ⚠ Kết quả của tầng (2) phải được dùng ở TẦNG TRUY VẤN. Cụ thể: không được select `expectedSalary`
 * khi người xem không đủ điều kiện — ẩn bằng CSS/JSX thì con số vẫn nằm nguyên trong HTML thô
 * (bài học KB-H2, HANDOVER 10.13).
 */

export type RecruitPerms = {
  meId: string | null;
  /** Xem được TOÀN BỘ kho vị trí + ứng viên. */
  canView: boolean;
  canManage: boolean;
  canJd: boolean;
  canAiParse: boolean;
  canInterview: boolean;
  canDecide: boolean;
  /** Gửi thư RA NGOÀI cho ứng viên — mã riêng vì thư đã đi thì không thu hồi được. */
  canEmail: boolean;
  /** Mã quyền xem lương — MỘT trong các cửa, không phải cửa duy nhất (xem canSeeExpectedSalary). */
  salaryPermission: boolean;
};

export async function getRecruitPerms(): Promise<RecruitPerms> {
  const [meId, canView, canManage, canJd, canAiParse, canInterview, canDecide, canEmail, salaryPermission] = await Promise.all([
    getCurrentStaffId(),
    hasPermission("recruit.view"),
    hasPermission("recruit.manage"),
    hasPermission("recruit.jd.manage"),
    hasPermission("recruit.ai_parse"),
    hasPermission("recruit.interview.manage"),
    hasPermission("recruit.decide"),
    hasPermission("recruit.email.send"),
    hasPermission("recruit.salary.view"),
  ]);
  return { meId, canView, canManage, canJd, canAiParse, canInterview, canDecide, canEmail, salaryPermission };
}

export type CandidateGate = {
  /** Mở được hồ sơ này không. */
  canOpen: boolean;
  /** Thấy được ô lương mong muốn không. */
  canSeeSalary: boolean;
  /** Người xem có phải người phỏng vấn được phân công cho ứng viên này không. */
  isAssignedInterviewer: boolean;
  /** Người xem có phải trưởng bộ phận / quản lý trực tiếp của vị trí này không. */
  isPositionOwner: boolean;
};

/**
 * Quyết định quyền trên MỘT hồ sơ ứng viên. Trả `null` khi không có hồ sơ đó.
 *
 * Truy vấn NHẸ, cố ý tách khỏi truy vấn nạp dữ liệu hiển thị: phải biết "có được xem lương không"
 * TRƯỚC thì mới quyết được có select cột lương hay không.
 */
export async function gateCandidate(candidateId: string, perms: RecruitPerms): Promise<CandidateGate | null> {
  const row = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      position: {
        select: {
          hiringManagerStaffId: true,
          department: { select: { leadStaffId: true } },
        },
      },
      interviews: { select: { interviewerStaffId: true } },
    },
  });
  if (!row) return null;

  const departmentLeadStaffId = row.position.department?.leadStaffId ?? null;
  const hiringManagerStaffId = row.position.hiringManagerStaffId;
  const isAssignedInterviewer = !!perms.meId && row.interviews.some((i) => i.interviewerStaffId === perms.meId);
  const isPositionOwner =
    !!perms.meId && (perms.meId === departmentLeadStaffId || perms.meId === hiringManagerStaffId);

  return {
    canOpen: canOpenCandidate({
      hasRecruitView: perms.canView || isPositionOwner,
      isAssignedInterviewer,
    }),
    canSeeSalary: canSeeExpectedSalary({
      hasSalaryPermission: perms.salaryPermission,
      viewerStaffId: perms.meId,
      departmentLeadStaffId,
      hiringManagerStaffId,
    }),
    isAssignedInterviewer,
    isPositionOwner,
  };
}

/**
 * Người dùng có lý do gì để thấy tab Tuyển dụng không — dùng để ẩn/hiện tab trên thanh Nhân sự.
 *
 * ⚠ Đây CHỈ là trang trí. Ẩn mục khỏi menu không phải là gác quyền; mọi trang và mọi action vẫn
 * tự kiểm lại (HANDOVER 10.1: không gate bằng layout).
 */
export async function shouldShowRecruitTab(): Promise<boolean> {
  if (await hasPermission("recruit.view")) return true;
  const meId = await getCurrentStaffId();
  if (!meId) return false;
  const [asInterviewer, asOwner] = await Promise.all([
    prisma.interview.count({ where: { interviewerStaffId: meId } }),
    prisma.jobPosition.count({
      where: {
        status: { not: "CLOSED" },
        OR: [{ hiringManagerStaffId: meId }, { department: { leadStaffId: meId } }],
      },
    }),
  ]);
  return asInterviewer > 0 || asOwner > 0;
}
