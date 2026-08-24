import "server-only";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { canOpenCandidate, canSeeExpectedSalary, isReplacedBySelf } from "@/lib/recruit";

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
  /**
   * Soạn / sửa / gửi THƯ MỜI NHẬN VIỆC. Tách khỏi `canDecide` ngày 24/08/2026: `decide` là QUYẾT
   * ĐỊNH nhận hay loại (BGĐ + Trưởng phòng NS), còn đây là khâu THI HÀNH offer — chỉ Senior HR
   * Manager. Cũng là cửa cho hai mẫu thư OFFER / ONBOARDING_NOTICE.
   */
  canOffer: boolean;
  /** Gửi thư RA NGOÀI cho ứng viên — mã riêng vì thư đã đi thì không thu hồi được. */
  canEmail: boolean;
  /** Mã quyền xem lương — MỘT trong các cửa, không phải cửa duy nhất (xem canSeeExpectedSalary). */
  salaryPermission: boolean;
};

export async function getRecruitPerms(): Promise<RecruitPerms> {
  const [meId, canView, canManage, canJd, canAiParse, canInterview, canDecide, canOffer, canEmail, salaryPermission] = await Promise.all([
    getCurrentStaffId(),
    hasPermission("recruit.view"),
    hasPermission("recruit.manage"),
    hasPermission("recruit.jd.manage"),
    hasPermission("recruit.ai_parse"),
    hasPermission("recruit.interview.manage"),
    hasPermission("recruit.decide"),
    hasPermission("recruit.offer.manage"),
    hasPermission("recruit.email.send"),
    hasPermission("recruit.salary.view"),
  ]);
  return { meId, canView, canManage, canJd, canAiParse, canInterview, canDecide, canOffer, canEmail, salaryPermission };
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
  /** Người xem CHÍNH LÀ người mà vị trí này tuyển để thay thế — chặn tuyệt đối, thắng cả mã quyền. */
  isReplacedBySelf: boolean;
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
          replacesStaffId: true,
          department: { select: { leadStaffId: true } },
        },
      },
      interviews: { select: { interviewerStaffId: true } },
    },
  });
  if (!row) return null;

  const departmentLeadStaffId = row.position.department?.leadStaffId ?? null;
  const hiringManagerStaffId = row.position.hiringManagerStaffId;
  const replacesStaffId = row.position.replacesStaffId;
  const isAssignedInterviewer = !!perms.meId && row.interviews.some((i) => i.interviewerStaffId === perms.meId);
  const replacedBySelf = isReplacedBySelf(perms.meId, replacesStaffId);
  const isPositionOwner =
    !replacedBySelf && !!perms.meId && (perms.meId === departmentLeadStaffId || perms.meId === hiringManagerStaffId);

  return {
    canOpen: canOpenCandidate({
      hasRecruitView: perms.canView || isPositionOwner,
      isAssignedInterviewer,
      isReplacedBySelf: replacedBySelf,
    }),
    canSeeSalary: canSeeExpectedSalary({
      hasSalaryPermission: perms.salaryPermission,
      viewerStaffId: perms.meId,
      departmentLeadStaffId,
      hiringManagerStaffId,
      replacesStaffId,
    }),
    isAssignedInterviewer,
    isPositionOwner,
    isReplacedBySelf: replacedBySelf,
  };
}

/**
 * Điều kiện Prisma cho "những vị trí người này được nhìn theo BẢN GHI" — trưởng bộ phận hoặc quản
 * lý trực tiếp, TRỪ vị trí tuyển để thay chính họ.
 *
 * ⚠ MỘT nguồn sự thật cho cả danh sách thu hẹp ở `/staff/recruit`, tab hiển thị, và mọi chỗ đếm.
 * Ba nơi tự viết `where` riêng là kiểu gì cũng có nơi quên mệnh đề `replacesStaffId`, và lỗ đó
 * không ai thấy cho tới lúc một trưởng bộ phận đọc được hồ sơ thay chính mình.
 */
export function ownedPositionWhere(meId: string) {
  // ⚠ Gộp bằng AND, KHÔNG spread: cả hai mệnh đề đều dùng khoá `OR`, spread là khoá sau ĐÈ khoá
  // trước và một trong hai điều kiện biến mất trong im lặng. Lần này tsc bắt được (TS2783) — nhưng
  // ở object Prisma khác thì nó không phải lúc nào cũng bắt, xem lỗi hai khoá `position` ở
  // trang Kho hồ sơ và hai khoá `where` ở đợt chia sẻ Thu mua (HANDOVER 10.55).
  return {
    AND: [
      { OR: [{ hiringManagerStaffId: meId }, { department: { leadStaffId: meId } }] },
      notReplacingWhere(meId),
    ],
  };
}

/**
 * Điều kiện "vị trí này KHÔNG phải tuyển để thay chính tôi".
 *
 * ⚠ PHẢI viết dạng `OR: [{ null }, { not }]`, TUYỆT ĐỐI KHÔNG viết `NOT: { replacesStaffId: meId }`.
 * Trong SQL, `NOT (cot = 'x')` với `cot IS NULL` cho ra NULL chứ không phải TRUE ⇒ mọi dòng chưa
 * khai người bị thay (tức gần như TOÀN BỘ vị trí) bị LOẠI SẠCH. Đo được trên dev.db: bản `NOT` trả
 * **0/7** vị trí, bản đúng trả **6/7**. Im lặng tuyệt đối — trang vẫn render, chỉ là rỗng.
 * Đây là lần thứ hai repo vấp đúng lớp lỗi này (lần trước: `aiReviewStatus` ở TD-2a, HANDOVER 10.62).
 */
export function notReplacingWhere(meId: string) {
  return { OR: [{ replacesStaffId: null }, { replacesStaffId: { not: meId } }] };
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
      where: { status: { not: "CLOSED" }, ...ownedPositionWhere(meId) },
    }),
  ]);
  return asInterviewer > 0 || asOwner > 0;
}
