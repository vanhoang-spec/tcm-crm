"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { saveCvFile, deleteCvFile, readCvFile } from "@/lib/recruit-storage";
import { extractTextFromFile } from "@/lib/ai/extract-text";
import { aiChatJson } from "@/lib/ai/deepseek";
import { cvParseMessages, cvParseSchema, type CvParseResult } from "@/lib/ai/recruit-prompts";
import {
  CV_MIME_TYPES,
  MAX_CV_BYTES,
  MAX_CV_TEXT_CHARS,
  MAX_JD_FIELD_CHARS,
  MIN_SCORE,
  MAX_SCORE,
  MIN_DURATION_MIN,
  MAX_DURATION_MIN,
  isInterviewRound,
  isRecommendation,
  formatSummaryForNotification,
} from "@/lib/recruit";
import { getRecruitPerms, gateCandidate } from "./access";

// ─────────────────────────────────────────────────────────
// Tiện ích chung
// ─────────────────────────────────────────────────────────

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Ô văn bản dài: cắt trần, rỗng thì trả null (để DB không đầy chuỗi rỗng). */
function textOrNull(v: FormDataEntryValue | null, max = MAX_JD_FIELD_CHARS): string | null {
  const s = str(v);
  return s ? s.slice(0, max) : null;
}

/** Ngày sinh "YYYY-MM-DD" → UTC-midnight, đúng quy ước ngày của app (HANDOVER 4.3). */
function dateOrNull(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function revalidate(candidateId?: string) {
  revalidatePath("/staff/recruit");
  revalidatePath("/staff/recruit/archive");
  revalidatePath("/staff/recruit/interviews");
  if (candidateId) revalidatePath(`/staff/recruit/candidates/${candidateId}`);
}

async function audit(entityId: string, action: string, field = "*", reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType: "candidate", entityId, field, action, changedBy: staffId, reason },
  });
}

// ─────────────────────────────────────────────────────────
// Nhận CV
// ─────────────────────────────────────────────────────────

export type UploadState = { error?: string };

/**
 * HR nhận CV: chọn vị trí đang tuyển + tải file lên. Hồ sơ tạo ra ở trạng thái NEW, các ô thông
 * tin để trống — bước đọc CV bằng AI làm ở trang chi tiết, tách riêng vì mỗi lượt gọi tốn tiền.
 */
export async function uploadCandidate(_prev: UploadState, formData: FormData): Promise<UploadState> {
  await requirePermission("recruit.manage");
  const meId = await getCurrentStaffId();

  const positionId = str(formData.get("positionId"));
  if (!positionId) return { error: "NO_POSITION" };
  const position = await prisma.jobPosition.findUnique({ where: { id: positionId }, select: { id: true, status: true } });
  if (!position) return { error: "NO_POSITION" };
  if (position.status === "CLOSED") return { error: "POSITION_CLOSED" };

  const file = formData.get("cv");
  if (!(file instanceof File) || file.size === 0) return { error: "NO_FILE" };
  if (file.size > MAX_CV_BYTES) return { error: "FILE_TOO_BIG" };
  if (!(CV_MIME_TYPES as readonly string[]).includes(file.type)) return { error: "FILE_TYPE" };

  // Tên ứng viên chưa biết trước khi đọc CV → mặc định lấy tên file (bỏ đuôi) để danh sách không
  // có dòng trống. AI đọc xong sẽ ghi đè bằng tên thật, HR sửa lại được.
  const typed = str(formData.get("fullName"));
  const fullName = (typed || file.name.replace(/\.[^.]+$/, "")).slice(0, 120);

  let fileKey: string;
  try {
    fileKey = await saveCvFile(Buffer.from(await file.arrayBuffer()), file.type);
  } catch (e) {
    console.error("[RECRUIT] lỗi lưu CV:", e);
    return { error: "SAVE_FAILED" };
  }

  const created = await prisma.candidate.create({
    data: {
      positionId,
      fullName,
      cvFileKey: fileKey,
      cvFileName: file.name.slice(0, 200),
      cvFileMime: file.type,
      cvFileSize: file.size,
      createdById: meId,
    },
    select: { id: true },
  });
  await audit(created.id, "create");
  revalidate(created.id);

  // ⚠ Điều hướng ở SERVER, không trả id về rồi để client `router.push()`. Gọi router trong lúc
  // render là cập nhật một component khác giữa chừng — React cảnh báo "Cannot update a component
  // while rendering a different component" và hành vi không bảo đảm ở chế độ đồng thời.
  // `redirect()` phải nằm NGOÀI try/catch, nếu không nó bị nuốt (nó hoạt động bằng cách ném lỗi).
  redirect(`/staff/recruit/candidates/${created.id}`);
}

// ─────────────────────────────────────────────────────────
// AI đọc CV
// ─────────────────────────────────────────────────────────

export type ParseState = { error?: string; parsed?: CvParseResult };

/**
 * Đọc CV bằng DeepSeek và TRẢ VỀ giá trị cho form — CỐ Ý KHÔNG ghi vào các ô hồ sơ.
 *
 * Vì sao không ghi thẳng: HR phải nhìn và duyệt trước khi lưu (đúng yêu cầu "fill vào thông tin
 * căn bản → cho lưu"). Ghi thẳng còn có rủi ro đè mất phần HR đã sửa tay nếu ai đó bấm lại nút.
 * Chỉ `aiParsedAt` được ghi, để biết CV này đã tốn một lượt gọi AI.
 *
 * ⚠ TUYỆT ĐỐI không bọc `$transaction` quanh lượt gọi AI: SQLite single-writer, một lượt tới ~90s,
 * giữ writer suốt thời gian đó là treo cả app (HANDOVER 10.14).
 */
export async function parseCvWithAi(_prev: ParseState, formData: FormData): Promise<ParseState> {
  await requirePermission("recruit.manage");
  // Gọi AI là ĐẶC QUYỀN THÊM chồng lên quyền soạn hồ sơ, không phải đường vòng thay thế nó —
  // mirror mẫu `finance.vendor_payment.over_cap` / `mkt.generate`.
  if (!(await hasPermission("recruit.ai_parse"))) return { error: "NO_AI_PERM" };

  const candidateId = str(formData.get("candidateId"));
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, cvFileKey: true, cvFileMime: true, position: { select: { title: true } } },
  });
  if (!candidate) return { error: "NOT_FOUND" };

  let text: string;
  try {
    const buffer = await readCvFile(candidate.cvFileKey);
    const extracted = await extractTextFromFile(buffer, candidate.cvFileMime);
    if (!extracted || !extracted.text.trim()) return { error: "CANNOT_READ" };
    text = extracted.text.slice(0, MAX_CV_TEXT_CHARS);
  } catch (e) {
    console.error("[RECRUIT] lỗi đọc file CV:", e);
    return { error: "CANNOT_READ" };
  }

  let raw: unknown;
  try {
    raw = await aiChatJson(cvParseMessages({ positionTitle: candidate.position.title, cvText: text }));
  } catch (e) {
    console.error("[RECRUIT] lỗi gọi AI đọc CV:", e);
    return { error: "AI_FAILED" };
  }

  // `aiChatJson` chỉ ép kiểu, không validate — Zod là chốt chặn thật.
  const parsed = cvParseSchema.safeParse(raw);
  if (!parsed.success) return { error: "AI_BAD_SHAPE" };

  await prisma.candidate.update({ where: { id: candidate.id }, data: { aiParsedAt: new Date() } });
  await audit(candidate.id, "ai_parse", "*");
  return { parsed: parsed.data };
}

// ─────────────────────────────────────────────────────────
// Lưu hồ sơ
// ─────────────────────────────────────────────────────────

export type SaveState = { error?: string; saved?: boolean };

export async function saveCandidate(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("recruit.manage");

  const candidateId = str(formData.get("candidateId"));
  const perms = await getRecruitPerms();
  const gate = await gateCandidate(candidateId, perms);
  if (!gate) return { error: "NOT_FOUND" };

  const fullName = str(formData.get("fullName")).slice(0, 120);
  if (!fullName) return { error: "NO_NAME" };

  const data: Record<string, unknown> = {
    fullName,
    dob: dateOrNull(formData.get("dob")),
    phone: textOrNull(formData.get("phone"), 40),
    email: textOrNull(formData.get("email"), 160),
    summaryWork: textOrNull(formData.get("summaryWork"), 4000),
    summarySkills: textOrNull(formData.get("summarySkills"), 4000),
    summaryOther: textOrNull(formData.get("summaryOther"), 4000),
  };

  // ⚠ Ô lương chỉ được GHI khi người đang lưu được phép XEM nó. Thiếu phép kiểm này thì người
  // không thấy ô lương vẫn ghi đè được giá trị cũ thành rỗng chỉ bằng cách bấm Lưu — mất số mà
  // không ai biết, vì chính họ cũng không nhìn thấy ô đó.
  if (gate.canSeeSalary) {
    const digits = str(formData.get("expectedSalary")).replace(/[^\d]/g, "");
    data.expectedSalary = digits ? BigInt(digits) : null;
  }

  await prisma.candidate.update({ where: { id: candidateId }, data });
  await audit(candidateId, "update");
  revalidate(candidateId);
  return { saved: true };
}

// ─────────────────────────────────────────────────────────
// Lịch phỏng vấn
// ─────────────────────────────────────────────────────────

export type InterviewState = { error?: string; ok?: boolean };

/**
 * HR đặt lịch một vòng phỏng vấn và gửi YÊU CẦU XÁC NHẬN tới người phỏng vấn. Lịch chỉ có hiệu
 * lực khi người đó bấm xác nhận — đúng yêu cầu "gửi request để người đó check lịch trống".
 */
export async function scheduleInterview(_prev: InterviewState, formData: FormData): Promise<InterviewState> {
  await requirePermission("recruit.interview.manage");
  const meId = await getCurrentStaffId();

  const candidateId = str(formData.get("candidateId"));
  const interviewerStaffId = str(formData.get("interviewerStaffId"));
  const round = Number(str(formData.get("round")));
  const durationMin = Number(str(formData.get("durationMin")) || "60");
  // ⚠ Ngày và giờ nhận TÁCH RIÊNG, cố ý KHÔNG dùng ô `datetime-local`: ô native hiển thị theo
  // locale của hệ điều hành và Chromium bỏ qua `lang`, nên máy đặt tiếng Anh-Mỹ sẽ hiện
  // mm/dd/yyyy — đúng lỗi đã phải vá ở `operations-grid.tsx` (HANDOVER 10.19). Ngày đi qua
  // `DateField` (mask dd/mm/yyyy cố định), giờ đi qua ô time (chỉ có HH:mm, không có ngày để nhầm).
  const dateStr = str(formData.get("date"));
  const timeStr = str(formData.get("time"));
  const location = textOrNull(formData.get("location"), 300);

  if (!interviewerStaffId) return { error: "NO_INTERVIEWER" };
  if (!isInterviewRound(round)) return { error: "BAD_ROUND" };
  if (!Number.isFinite(durationMin) || durationMin < MIN_DURATION_MIN || durationMin > MAX_DURATION_MIN) {
    return { error: "BAD_DURATION" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) return { error: "BAD_TIME" };
  // Mốc phỏng vấn là THỜI ĐIỂM THẬT (không phải cột ngày nghiệp vụ), nên dựng theo giờ ĐỊA PHƯƠNG
  // của tiến trình — server bắt buộc đặt TZ=Asia/Ho_Chi_Minh (HANDOVER mục 8). Dùng quy ước
  // UTC-midnight ở đây là hẹn 9h sáng thành 16h chiều.
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const scheduledAt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(scheduledAt.getTime())) return { error: "BAD_TIME" };

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, fullName: true, status: true, summarySkills: true, position: { select: { title: true } } },
  });
  if (!candidate) return { error: "NOT_FOUND" };
  if (candidate.status === "HIRED" || candidate.status === "REJECTED") return { error: "ALREADY_DECIDED" };

  const interviewer = await prisma.staff.findUnique({ where: { id: interviewerStaffId }, select: { id: true } });
  if (!interviewer) return { error: "NO_INTERVIEWER" };

  let interviewId: string;
  try {
    const created = await prisma.interview.create({
      data: { candidateId, round, interviewerStaffId, scheduledAt, durationMin, location, createdById: meId },
      select: { id: true },
    });
    interviewId = created.id;
  } catch {
    // @@unique([candidateId, round, interviewerStaffId]) — đặt trùng người cho cùng một vòng.
    return { error: "DUPLICATE" };
  }

  // Hồ sơ chuyển sang "đang phỏng vấn" ngay từ lượt hẹn đầu tiên.
  if (candidate.status === "NEW") {
    await prisma.candidate.update({ where: { id: candidateId }, data: { status: "INTERVIEWING" } });
  }

  // Thông báo kèm thông tin sơ lược để người phỏng vấn quyết được lịch mà không phải mở hồ sơ.
  await prisma.notification.create({
    data: {
      recipientStaffId: interviewerStaffId,
      type: "INTERVIEW_REQUESTED",
      title: `Đề nghị phỏng vấn vòng ${round}: ${candidate.fullName}`,
      body: formatSummaryForNotification({
        positionTitle: candidate.position.title,
        scheduledAt,
        durationMin,
        location,
        summarySkills: candidate.summarySkills,
      }),
    },
  });

  await audit(candidateId, "interview_scheduled", "interview", `vòng ${round}`);
  revalidate(candidateId);
  return { ok: true };
}

/**
 * Người phỏng vấn xác nhận hoặc từ chối lịch.
 *
 * ⚠ Không có mã quyền — phép kiểm là "bạn CÓ PHẢI người được phân công không". Gác bằng mã quyền
 * ở đây sẽ chặn đúng những người cần dùng nó nhất (trưởng bộ phận, BGĐ không có quyền tuyển dụng).
 */
export async function respondInterview(_prev: InterviewState, formData: FormData): Promise<InterviewState> {
  const meId = await getCurrentStaffId();
  if (!meId) return { error: "NO_AUTH" };

  const interviewId = str(formData.get("interviewId"));
  const accept = str(formData.get("accept")) === "1";
  const declineReason = textOrNull(formData.get("declineReason"), 500);
  if (!accept && !declineReason) return { error: "NO_REASON" };

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      id: true,
      round: true,
      interviewerStaffId: true,
      createdById: true,
      candidate: { select: { id: true, fullName: true } },
    },
  });
  if (!interview) return { error: "NOT_FOUND" };
  if (interview.interviewerStaffId !== meId) return { error: "NOT_YOURS" };

  // status trong `where` + kiểm count: chống bấm hai lần và chống đua với thao tác huỷ của HR.
  const res = await prisma.interview.updateMany({
    where: { id: interviewId, status: "PENDING" },
    data: {
      status: accept ? "CONFIRMED" : "DECLINED",
      respondedAt: new Date(),
      declineReason: accept ? null : declineReason,
    },
  });
  if (res.count === 0) return { error: "ALREADY_RESPONDED" };

  if (interview.createdById) {
    await prisma.notification.create({
      data: {
        recipientStaffId: interview.createdById,
        type: accept ? "INTERVIEW_CONFIRMED" : "INTERVIEW_DECLINED",
        title: accept
          ? `Đã nhận lịch phỏng vấn vòng ${interview.round}: ${interview.candidate.fullName}`
          : `Từ chối lịch phỏng vấn vòng ${interview.round}: ${interview.candidate.fullName}`,
        body: accept ? null : declineReason,
      },
    });
  }

  await audit(interview.candidate.id, accept ? "interview_confirmed" : "interview_declined", "interview");
  revalidate(interview.candidate.id);
  return { ok: true };
}

/** HR huỷ một lượt hẹn (đặt nhầm giờ, người phỏng vấn báo bận…). */
export async function cancelInterview(_prev: InterviewState, formData: FormData): Promise<InterviewState> {
  await requirePermission("recruit.interview.manage");
  const interviewId = str(formData.get("interviewId"));
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { candidateId: true, status: true },
  });
  if (!interview) return { error: "NOT_FOUND" };
  if (interview.status === "DONE") return { error: "ALREADY_DONE" };

  const res = await prisma.interview.updateMany({
    where: { id: interviewId, status: { not: "DONE" } },
    data: { status: "CANCELLED" },
  });
  if (res.count === 0) return { error: "ALREADY_DONE" };
  await audit(interview.candidateId, "interview_cancelled", "interview");
  revalidate(interview.candidateId);
  return { ok: true };
}

/**
 * Ghi kết quả phỏng vấn: điểm từng tiêu chí + đề xuất + nhận xét.
 *
 * Người chấm = người phỏng vấn được phân công. HR có `recruit.interview.manage` cũng ghi được —
 * ca thật: người phỏng vấn đọc điểm qua điện thoại cho HR nhập hộ.
 */
export async function saveInterviewResult(_prev: InterviewState, formData: FormData): Promise<InterviewState> {
  const meId = await getCurrentStaffId();
  if (!meId) return { error: "NO_AUTH" };

  const interviewId = str(formData.get("interviewId"));
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { id: true, candidateId: true, interviewerStaffId: true, status: true },
  });
  if (!interview) return { error: "NOT_FOUND" };
  if (interview.interviewerStaffId !== meId && !(await hasPermission("recruit.interview.manage"))) {
    return { error: "NOT_YOURS" };
  }
  if (interview.status === "CANCELLED") return { error: "CANCELLED" };

  const recommendation = str(formData.get("recommendation"));
  if (!isRecommendation(recommendation)) return { error: "NO_RECOMMENDATION" };

  // Điểm gửi lên dạng "score__<mã tiêu chí>" và "note__<mã tiêu chí>". Bỏ trống một tiêu chí là
  // hợp lệ (không phải tiêu chí nào cũng đánh giá được ở mọi vòng) — chỉ ô nào có điểm mới lưu.
  const scores: { criterionCode: string; score: number; note: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("score__")) continue;
    const code = key.slice("score__".length);
    const n = Number(str(value));
    if (!Number.isInteger(n) || n < MIN_SCORE || n > MAX_SCORE) continue;
    scores.push({ criterionCode: code, score: n, note: textOrNull(formData.get(`note__${code}`), 1000) });
  }

  await prisma.$transaction(async (tx) => {
    await tx.interviewScore.deleteMany({ where: { interviewId } });
    if (scores.length) {
      await tx.interviewScore.createMany({ data: scores.map((s) => ({ interviewId, ...s })) });
    }
    await tx.interview.update({
      where: { id: interviewId },
      data: {
        recommendation,
        strengths: textOrNull(formData.get("strengths"), 2000),
        concerns: textOrNull(formData.get("concerns"), 2000),
        note: textOrNull(formData.get("note"), 2000),
        scoredAt: new Date(),
        status: "DONE",
      },
    });
  });

  await audit(interview.candidateId, "interview_scored", "interview", recommendation);
  revalidate(interview.candidateId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// Chốt kết quả
// ─────────────────────────────────────────────────────────

export type DecideState = { error?: string; ok?: boolean };

/**
 * Chốt "Thành công" hoặc "Từ chối".
 *
 * Từ chối KHÔNG xoá gì cả: hồ sơ giữ nguyên vị trí đã ứng tuyển nên kho hồ sơ tìm lại được theo
 * phòng ban / vị trí về sau — đúng yêu cầu "chuyển toàn bộ hồ sơ sang lưu cho sau này tìm lại".
 */
export async function decideCandidate(_prev: DecideState, formData: FormData): Promise<DecideState> {
  await requirePermission("recruit.decide");
  const meId = await getCurrentStaffId();

  const candidateId = str(formData.get("candidateId"));
  const outcome = str(formData.get("outcome"));
  if (outcome !== "HIRED" && outcome !== "REJECTED") return { error: "BAD_OUTCOME" };

  const note = textOrNull(formData.get("decisionNote"), 1000);
  // Lý do từ chối là thứ khiến kho hồ sơ dùng được về sau — không có nó thì một năm sau mở lại
  // chỉ thấy "đã từ chối" mà không ai nhớ vì sao.
  if (outcome === "REJECTED" && !note) return { error: "NO_REASON" };

  const res = await prisma.candidate.updateMany({
    where: { id: candidateId, status: { in: ["NEW", "INTERVIEWING"] } },
    data: { status: outcome, decidedAt: new Date(), decidedById: meId, decisionNote: note },
  });
  if (res.count === 0) return { error: "ALREADY_DECIDED" };

  await audit(candidateId, "decide", "status", outcome);
  revalidate(candidateId);
  return { ok: true };
}

/** Mở lại hồ sơ đã chốt (bấm nhầm, hoặc ứng viên quay lại thương lượng). */
export async function reopenCandidate(_prev: DecideState, formData: FormData): Promise<DecideState> {
  await requirePermission("recruit.decide");
  const candidateId = str(formData.get("candidateId"));
  const res = await prisma.candidate.updateMany({
    where: { id: candidateId, status: { in: ["HIRED", "REJECTED"] } },
    data: { status: "INTERVIEWING", decidedAt: null, decidedById: null, decisionNote: null },
  });
  if (res.count === 0) return { error: "NOT_DECIDED" };
  await audit(candidateId, "reopen", "status");
  revalidate(candidateId);
  return { ok: true };
}

/** Gỡ hồ sơ nhập nhầm — xoá cả file CV trên đĩa để không để lại dữ liệu cá nhân mồ côi. */
export async function deleteCandidate(_prev: DecideState, formData: FormData): Promise<DecideState> {
  await requirePermission("recruit.manage");
  const candidateId = str(formData.get("candidateId"));
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { cvFileKey: true, interviews: { select: { id: true } } },
  });
  if (!candidate) return { error: "NOT_FOUND" };
  // Đã phỏng vấn thì không xoá — dùng "Từ chối" để giữ lại lịch sử.
  if (candidate.interviews.length > 0) return { error: "HAS_INTERVIEWS" };

  await prisma.candidate.delete({ where: { id: candidateId } });
  await deleteCvFile(candidate.cvFileKey);
  await audit(candidateId, "delete");
  revalidate();
  return { ok: true };
}
