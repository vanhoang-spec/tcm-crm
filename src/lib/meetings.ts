// MEET-1 — Họp Account team hằng tuần. Hàm THUẦN (không prisma): mốc tuần, gộp dòng với dự án đang chạy,
// việc tồn qua tuần, khớp kết quả AI với dự án/khách, và dựng "gói họp tuần" markdown. Server action chỉ nạp
// dữ liệu → gọi hàm ở đây → ghi DB (HANDOVER 4.1).

import { foldName } from "@/lib/rfq";

/** Dự án "đang chạy" theo nghĩa họp tuần = mọi trạng thái còn sống. KHÔNG dùng EXECUTION_STATUS_CODES
 * (chứa FINISHED, thiếu BIDDING) — họp tuần theo dõi cả job đang đấu thầu. */
export const MEETING_PROJECT_STATUS_CODES = ["BIDDING", "PROCESSING", "LIQUIDATION", "HANDOVER"] as const;

export const RAG_CODES = ["GREEN", "YELLOW", "RED"] as const;
export type RagCode = (typeof RAG_CODES)[number];
export function isRagCode(v: unknown): v is RagCode {
  return typeof v === "string" && (RAG_CODES as readonly string[]).includes(v);
}

/** Trần văn bản biên bản (dán hoặc trích từ file) gửi cho AI. Biên bản tuần thật 8–15k ký tự — trần 6.000 của
 * extractTextFromFile sẽ mất nửa cuộc họp, nên truyền maxChars riêng. */
/**
 * Trần ký tự biên bản. 40k chứ không phải 20k: dashboard tuần THẬT do Claude Project xuất ra
 * (file `Dashboard_Account1.html`, đo 18/08/2026) dài 35.207 ký tự và phần VIỆC CẦN LÀM nằm ở CUỐI
 * trang — cắt ở 20k là mất sạch 38 action item, tức mất đúng thứ module này sinh ra để theo dõi.
 */
export const MAX_MEETING_TEXT_CHARS = 40_000;
/**
 * ⚠ CÓ `text/html`: dashboard họp tuần Claude Project xuất ra là HTML một trang (đo trên file thật
 * 18/08/2026), KHÔNG phải .md/.docx. Thiếu kiểu này thì người dùng không tải lên được đúng thứ họ có.
 */
export const MEETING_FILE_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "text/html",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const MAX_MEETING_FILE_BYTES = 10 * 1024 * 1024;

export const ACTION_STATUSES = ["OPEN", "DONE"] as const;

// ── Tuần ──────────────────────────────────────────────────────────────────────

/**
 * Thứ Hai của tuần chứa `d`, tính theo NGÀY ĐỊA PHƯƠNG (server TZ=Asia/Ho_Chi_Minh), trả về UTC-midnight
 * theo quy ước cột ngày nghiệp vụ (HANDOVER 4.3). Đọc thành phần địa phương chứ không getUTC* — bug lệch 1 ngày
 * lúc 0–7h sáng đã vá ở Kho v2 K4.
 */
export function weekStartUtc(d: Date): Date {
  const dow = d.getDay(); // 0 = CN
  const diff = dow === 0 ? 6 : dow - 1;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - diff));
}

/** "YYYY-MM-DD" của một mốc UTC-midnight. */
export function weekKey(weekStart: Date): string {
  return weekStart.toISOString().slice(0, 10);
}

/** Parse "YYYY-MM-DD" → UTC-midnight, CHỈ nhận thứ Hai (tuần luôn neo T2). Sai định dạng / không phải T2 → null. */
export function parseWeekKey(s: string | undefined | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (dt.getUTCDay() !== 1) return null;
  return dt;
}

export function addWeeks(weekStart: Date, n: number): Date {
  return new Date(weekStart.getTime() + n * 7 * 24 * 3600 * 1000);
}

// ── Gộp dòng đã lưu với dự án đang chạy ────────────────────────────────────────

export type RunningProjectLite = {
  id: string;
  code: string;
  name: string;
  ownerTeamId: string | null;
  client: { id: string; code: string; name: string };
};

export type SavedRowLite = {
  id: string;
  clientId: string;
  projectId: string | null;
  rag: string | null;
  update: string | null;
  risks: string | null;
  nextSteps: string | null;
  sort: number;
  project: { id: string; code: string; name: string; ownerTeamId: string | null } | null;
  client: { id: string; code: string; name: string };
};

export type MeetingRowView = {
  /** id dòng đã lưu, null = dòng NHÁP sinh từ dự án đang chạy chưa có dòng. */
  id: string | null;
  clientId: string;
  clientCode: string;
  clientName: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  rag: string | null;
  update: string;
  risks: string;
  nextSteps: string;
  sort: number;
  /** Dự án đã chuyển sang team khác sau khi dòng được lưu — giữ lịch sử, gắn nhãn. */
  movedTeam: boolean;
};

/**
 * Dòng đã lưu ∪ dự án đang chạy của team chưa có dòng (nháp). Sắp theo khách (mã) rồi dự án; dòng khách
 * không dự án đứng cuối nhóm khách đó. Dòng lưu có `project.ownerTeamId !== teamId` → `movedTeam`.
 */
export function mergeRowsWithProjects(saved: SavedRowLite[], running: RunningProjectLite[], teamId: string): MeetingRowView[] {
  const out: MeetingRowView[] = saved.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    clientCode: r.client.code,
    clientName: r.client.name,
    projectId: r.projectId,
    projectCode: r.project?.code ?? null,
    projectName: r.project?.name ?? null,
    rag: r.rag,
    update: r.update ?? "",
    risks: r.risks ?? "",
    nextSteps: r.nextSteps ?? "",
    sort: r.sort,
    movedTeam: !!r.project && r.project.ownerTeamId !== teamId,
  }));
  const seen = new Set(saved.map((r) => r.projectId).filter((x): x is string => !!x));
  for (const p of running) {
    if (seen.has(p.id)) continue;
    out.push({
      id: null,
      clientId: p.client.id,
      clientCode: p.client.code,
      clientName: p.client.name,
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      rag: null,
      update: "",
      risks: "",
      nextSteps: "",
      sort: 9999,
      movedTeam: false,
    });
  }
  return out.sort((a, b) => {
    if (a.clientCode !== b.clientCode) return a.clientCode.localeCompare(b.clientCode);
    if (!!a.projectCode !== !!b.projectCode) return a.projectCode ? -1 : 1; // dòng khách-không-dự-án xuống cuối nhóm
    return (a.projectCode ?? "").localeCompare(b.projectCode ?? "") || a.sort - b.sort;
  });
}

// ── Việc tồn ─────────────────────────────────────────────────────────────────

export type ActionLite = { id: string; status: string; meetingWeekStart: Date };

/**
 * Việc TỒN của tuần W = mọi việc còn OPEN sinh ra ở tuần TRƯỚC W (không copy dòng — việc thuộc tuần sinh
 * ra nó). Việc của chính tuần W không tính là tồn; việc DONE không hiện.
 */
export function carryOverActions<T extends ActionLite>(actions: T[], weekStart: Date): T[] {
  return actions.filter((a) => a.status === "OPEN" && a.meetingWeekStart.getTime() < weekStart.getTime());
}

// ── Khớp kết quả AI với dự án / khách ────────────────────────────────────────

export type ParsedRow = {
  projectCode?: string | null;
  projectName?: string | null;
  clientName?: string | null;
  rag?: string | null;
  update?: string | null;
  risks?: string | null;
  nextSteps?: string | null;
};

export type MatchedRow = {
  clientId: string;
  projectId: string | null;
  rag: RagCode | null;
  update: string;
  risks: string;
  nextSteps: string;
  /** Cách khớp — để form hiện nhãn cho người duyệt. */
  matchedBy: "PROJECT_CODE" | "PROJECT_NAME" | "CLIENT";
};

export type ClientLite = { id: string; code: string; name: string };

/**
 * Khớp từng dòng AI trả về với dự án đang chạy (mã CHÍNH XÁC → tên chuẩn hoá bỏ dấu, chứa nhau) rồi tới khách
 * (mã / tên chuẩn hoá). Không khớp → `unmatched` để người dùng tự xử lý; KHÔNG BAO GIỜ tạo dự án/khách mới.
 */
/** Khách của một dòng AI: khớp mã (AHL) → tên đầy đủ → tên là chuỗi con của tên khách. Một nguồn sự thật
 *  cho CẢ phép kiểm chéo lúc khớp theo tên dự án LẪN dòng mức khách — hai bên lệch nhau là gán nhầm. */
function clientOf(name: string | null | undefined, clients: ClientLite[]): ClientLite | undefined {
  const cn = name ? foldName(name) : "";
  if (!cn) return undefined;
  return clients.find((x) => x.code.toLowerCase() === cn || foldName(x.name) === cn || (cn.length >= 3 && foldName(x.name).includes(cn)));
}

export function matchParsedRows(
  parsed: ParsedRow[],
  projects: RunningProjectLite[],
  clients: ClientLite[],
): { rows: MatchedRow[]; unmatched: ParsedRow[] } {
  const rows: MatchedRow[] = [];
  const unmatched: ParsedRow[] = [];
  const byCode = new Map(projects.map((p) => [p.code.toUpperCase(), p]));
  const norm = (s: string | null | undefined) => (s ? foldName(s) : "");
  for (const r of parsed) {
    const rag = isRagCode(r.rag) ? r.rag : null;
    const base = { rag, update: (r.update ?? "").trim(), risks: (r.risks ?? "").trim(), nextSteps: (r.nextSteps ?? "").trim() };
    // ⚠ BỎ dòng RỖNG (không RAG, không chữ nào). Prompt có đưa danh sách dự án của team để model điền
    // đúng mã, và model hay "điền cho đủ" mỗi dự án một dòng: đo trên dashboard thật 18/08/2026 ra 17
    // dòng thì 11 dòng rỗng tuếch. Dòng rỗng không phải nội dung họp — nó chỉ đẩy dự án không được
    // nhắc vào biên bản rồi ghi đè dòng người dùng đã gõ tay bằng chuỗi trống.
    if (!rag && !base.update && !base.risks && !base.nextSteps) continue;
    const code = (r.projectCode ?? "").trim().toUpperCase();
    const p1 = code ? byCode.get(code) : undefined;
    if (p1) {
      rows.push({ clientId: p1.client.id, projectId: p1.id, matchedBy: "PROJECT_CODE", ...base });
      continue;
    }
    // ⚠ Khớp theo TÊN dự án phải ĐỒNG Ý với khách nếu biên bản có nêu khách. Tên dự án trong ngành này
    // trùng nhau như cơm bữa ("Christmas Decor", "Trung thu", "Black Friday"): đo trên dashboard thật
    // 18/08/2026, dòng của Saigon Centre ("Christmas Decoration 2026") khớp trúng dự án "Christmas Decor"
    // của AEON Hạ Long — tức ghi tình hình khách này vào dự án khách khác, im lặng. Nêu sai khách thì bỏ
    // khớp theo tên, rơi xuống khớp theo khách (dòng mức khách) — thà thô hơn là gán nhầm.
    const rowClient = clientOf(r.clientName, clients);
    const pn = norm(r.projectName);
    const p2 =
      pn.length >= 4
        ? projects.find((p) => {
            const n = norm(p.name);
            if (!(n === pn || n.includes(pn) || pn.includes(n))) return false;
            return !rowClient || rowClient.id === p.client.id;
          })
        : undefined;
    if (p2) {
      rows.push({ clientId: p2.client.id, projectId: p2.id, matchedBy: "PROJECT_NAME", ...base });
      continue;
    }
    const c = rowClient;
    if (c) {
      rows.push({ clientId: c.id, projectId: null, matchedBy: "CLIENT", ...base });
      continue;
    }
    unmatched.push(r);
  }
  return { rows, unmatched };
}

/** Khớp tên người được giao với danh sách nhân sự (tên chuẩn hoá bỏ dấu; đủ hoặc chứa nhau). Không khớp → null. */
export function matchAssignee(name: string | null | undefined, staff: { id: string; fullName: string }[]): string | null {
  const n = name ? foldName(name) : "";
  if (!n) return null;
  const exact = staff.find((s) => foldName(s.fullName) === n);
  if (exact) return exact.id;
  const parts = n.split(" ").filter(Boolean);
  if (parts.length === 0) return null;
  const cands = staff.filter((s) => { const f = foldName(s.fullName); return f.includes(n) || (parts.length >= 2 && parts.every((w) => f.includes(w))); });
  return cands.length === 1 ? cands[0].id : null;
}

// ── Gói họp tuần (markdown) ──────────────────────────────────────────────────

export type WeeklyPackInput = {
  teamCode: string;
  teamName: string;
  weekStart: Date;
  generatedAt: Date;
  projects: { code: string; name: string; clientName: string; statusLabel: string; marginPct: number | null; eventDates: string | null }[];
  lastWeekRows: { projectCode: string | null; clientName: string; rag: string | null; update: string; risks: string; nextSteps: string }[];
  openActions: { title: string; assignee: string | null; dueDate: string | null; fromWeek: string }[];
  overdueTimeline: { projectCode: string; title: string; dueDate: string; daysLate: number }[];
  overdueAr: { clientName: string; projectCode: string | null; amount: number; daysLate: number }[];
  careOverdue: { clientName: string; daysSince: number }[];
};

const fmtVnd = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + " đ";
const fmtDate = (d: Date) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/** Markdown gói họp: dán vào Claude Project trước giờ họp. Không có số nào ngoài input — hàm không tính gì thêm. */
export function renderWeeklyPackMarkdown(i: WeeklyPackInput): string {
  const L: string[] = [];
  L.push(`# Gói họp tuần — Team ${i.teamCode} (${i.teamName}) — tuần ${fmtDate(i.weekStart)}`);
  L.push(`_Xuất từ TCM CRM lúc ${fmtDate(i.generatedAt)}. Số liệu realtime tại thời điểm xuất._`, "");
  L.push(`## 1. Dự án đang chạy (${i.projects.length})`);
  if (i.projects.length === 0) L.push("- (không có)");
  for (const p of i.projects) {
    const m = p.marginPct == null ? "" : ` · margin ${p.marginPct.toFixed(1)}%`;
    L.push(`- **${p.code}** ${p.name} — ${p.clientName} · ${p.statusLabel}${m}${p.eventDates ? ` · sự kiện ${p.eventDates}` : ""}`);
  }
  L.push("", `## 2. Cập nhật tuần trước (${i.lastWeekRows.length} dòng)`);
  if (i.lastWeekRows.length === 0) L.push("- (chưa có biên bản tuần trước)");
  for (const r of i.lastWeekRows) {
    L.push(`- ${r.projectCode ?? "(khách)"} · ${r.clientName} · ${r.rag ?? "—"}: ${r.update || "—"}${r.risks ? ` | Rủi ro: ${r.risks}` : ""}${r.nextSteps ? ` | Tuần tới: ${r.nextSteps}` : ""}`);
  }
  L.push("", `## 3. Việc còn mở (${i.openActions.length})`);
  if (i.openActions.length === 0) L.push("- (không có)");
  for (const a of i.openActions) L.push(`- [ ] ${a.title} — ${a.assignee ?? "CHƯA GÁN NGƯỜI"}${a.dueDate ? ` · hạn ${a.dueDate}` : ""} · từ tuần ${a.fromWeek}`);
  L.push("", `## 4. Timeline quá hạn (${i.overdueTimeline.length})`);
  if (i.overdueTimeline.length === 0) L.push("- (không có)");
  for (const t of i.overdueTimeline) L.push(`- ${t.projectCode} · ${t.title} · hạn ${t.dueDate} · trễ ${t.daysLate} ngày`);
  L.push("", `## 5. Công nợ quá hạn (${i.overdueAr.length})`);
  if (i.overdueAr.length === 0) L.push("- (không có)");
  for (const a of i.overdueAr) L.push(`- ${a.clientName}${a.projectCode ? ` · ${a.projectCode}` : ""} · ${fmtVnd(a.amount)} · trễ ${a.daysLate} ngày`);
  L.push("", `## 6. Khách lâu chưa chăm sóc (${i.careOverdue.length})`);
  if (i.careOverdue.length === 0) L.push("- (không có)");
  for (const c of i.careOverdue) L.push(`- ${c.clientName} · ${c.daysSince} ngày`);
  L.push("", "---", "Gợi ý cho Claude: với mỗi dự án ở mục 1, hỏi team cập nhật tình hình / rủi ro / việc tuần tới; cuối buổi tổng hợp thành bảng: Mã dự án | Khách | Trạng thái (GREEN/YELLOW/RED) | Cập nhật | Rủi ro | Việc tuần tới; và danh sách việc: Việc | Người phụ trách | Hạn (YYYY-MM-DD).");
  return L.join("\n");
}
