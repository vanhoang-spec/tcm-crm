import { prisma } from "./prisma";
import { getCurrentStaffId } from "./current-staff";

// ─────────────────────────────────────────────────────────
// ⚠ Chỉ hiển thị (presentational) — CHƯA phải kiểm soát truy cập thật. App chưa có auth thật
// (xem current-staff.ts: "act as" là cookie demo, fallback CEO khi không có cookie). Mọi "phạm vi
// xem" ở đây chỉ quyết định server component render gì cho request hiện tại, KHÔNG chặn API/action
// nào — nhất quán với toàn bộ codebase (Role/roleId cũng nominal, chưa gate tính năng thật).
// TODO(auth): thay bằng kiểm tra quyền thật khi có đăng nhập.
// ─────────────────────────────────────────────────────────

export type DashboardScope = {
  /** true = Ban điều hành (phòng CEO) hoặc CFO — thấy đủ số liệu toàn công ty + khối Cashflow. */
  isExec: boolean;
  canSeeAllTeams: boolean;
  canSeeCashflow: boolean;
  /** Team Account của nhân sự hiện tại (A1/A2/A3) — null nếu không thuộc Account hoặc là exec. */
  ownTeamCode: string | null;
  /** Danh sách team hiển thị ở khối kinh doanh: ["A1","A2","A3","ALL"] cho exec, [team] cho Account, ["ALL"] cho phòng khác. */
  visibleTeamCodes: string[];
  /** Mã phòng ban của nhân sự hiện tại — dùng để tô đậm card bộ phận mình ở khối tiến độ. */
  highlightDept: string | null;
};

/** Tính phạm vi hiển thị Dashboard cho nhân sự đang "act as". */
export async function getDashboardScope(): Promise<DashboardScope> {
  const staffId = await getCurrentStaffId();
  const staff = staffId
    ? await prisma.staff.findUnique({
        where: { id: staffId },
        select: { title: true, department: { select: { code: true } }, team: { select: { code: true } } },
      })
    : null;

  const isExec = staff?.department?.code === "CEO" || staff?.title === "CFO";
  const deptCode = staff?.department?.code ?? null;
  const ownTeamCode = !isExec && deptCode === "ACCOUNT" ? (staff?.team?.code ?? null) : null;

  const allTeams = await prisma.team.findMany({ where: { isActive: true }, select: { code: true }, orderBy: { code: "asc" } });
  const visibleTeamCodes = isExec ? [...allTeams.map((t) => t.code), "ALL"] : ownTeamCode ? [ownTeamCode] : ["ALL"];

  return {
    isExec,
    canSeeAllTeams: isExec,
    canSeeCashflow: isExec,
    ownTeamCode,
    visibleTeamCodes,
    highlightDept: !isExec && deptCode !== "ACCOUNT" ? deptCode : null,
  };
}

// ─────────────────────────────────────────────────────────
// Phạm vi hiển thị trợ lý AI — gate theo TỪNG NGƯỜI (không chỉ theo phòng ban/title như
// getDashboardScope), vì BGĐ yêu cầu đúng danh sách 3 người cụ thể cho "Báo cáo BGĐ"/"Xu hướng
// ngành" — khớp `title === "CFO"` cũ SAI với Phạm Thu Huyền (title thật là "Chief Financial
// Officer (CFO)", không phải chuỗi "CFO" nguyên văn). Match theo EMAIL — ổn định hơn fullName
// (không đụng dấu, không trùng khi có 2 người trùng tên). Cùng quy ước "chỉ hiển thị" như trên:
// mọi action AI vẫn tự re-check bằng chính hàm này trước khi gọi model (không tin UI).
// ─────────────────────────────────────────────────────────

/** Ban điều hành 3 người: Chủ tịch, CEO, CFO. */
const AI_EXEC_EMAILS = ["ndbinh@tcmbtl.com", "nvhoang@tcmbtl.com", "pthuyen@tcmbtl.com"];
/** BGĐ + Hồ Sĩ Bảo (BD & Production Director) — thấy TOÀN BỘ module AI bất kể phòng ban. */
const AI_ALL_ACCESS_EMAILS = [...AI_EXEC_EMAILS, "hsbao@tcmbtl.com"];

export type AiVisibility = {
  isAllAccess: boolean;
  isExec: boolean;
  deptCode: string | null;
  /** Ý tưởng & Concept — Account/Creative/Planning/HR. */
  canBrainstorm: boolean;
  /** Viết bài/Content — Account/Planning/HR. */
  canContent: boolean;
  /** Brief thiết kế Canva — Account/Planning. */
  canCanva: boolean;
  /** Rà soát CO/CE — Account/Kế toán. */
  canCostSheet: boolean;
  /** Báo cáo BGĐ — đúng 3 người Ban điều hành (+ all-access). */
  canBoardReport: boolean;
  /** Xu hướng ngành — Account + Ban điều hành (+ all-access). */
  canTrend: boolean;
};

export async function getAiVisibility(): Promise<AiVisibility> {
  const staffId = await getCurrentStaffId();
  const staff = staffId
    ? await prisma.staff.findUnique({ where: { id: staffId }, select: { email: true, department: { select: { code: true } } } })
    : null;

  const email = staff?.email ?? null;
  const deptCode = staff?.department?.code ?? null;
  const isAllAccess = !!email && AI_ALL_ACCESS_EMAILS.includes(email);
  const isExec = !!email && AI_EXEC_EMAILS.includes(email);
  const inDept = (codes: string[]) => isAllAccess || (deptCode !== null && codes.includes(deptCode));

  return {
    isAllAccess,
    isExec,
    deptCode,
    canBrainstorm: inDept(["ACCOUNT", "CREATIVE", "PLANNING", "HR"]),
    canContent: inDept(["ACCOUNT", "PLANNING", "HR"]),
    canCanva: inDept(["ACCOUNT", "PLANNING"]),
    canCostSheet: inDept(["ACCOUNT", "FIN"]),
    canBoardReport: isExec || isAllAccess,
    canTrend: isAllAccess || isExec || deptCode === "ACCOUNT",
  };
}
