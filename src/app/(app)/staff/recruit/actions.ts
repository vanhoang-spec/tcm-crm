"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { loadCriteria } from "@/lib/recruit-score-server";
import { computeTotal, scopeForPosition } from "@/lib/recruit-scoring";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { saveCvFile, deleteCvFile, readCvFile } from "@/lib/recruit-storage";
import { extractTextFromFile } from "@/lib/ai/extract-text";
import { aiChatJson } from "@/lib/ai/deepseek";
import { cvParseMessages, cvParseSchema, type CvParseResult } from "@/lib/ai/recruit-prompts";
import {
  CV_MIME_TYPES,
  MAX_CV_BYTES,
  MAX_CV_UPLOAD,
  MAX_CV_TOTAL_BYTES,
  MAX_CV_TEXT_CHARS,
  MAX_JD_FIELD_CHARS,
  MIN_DURATION_MIN,
  MAX_DURATION_MIN,
  isInterviewRound,
  isRecommendation,
  formatSummaryForNotification,
} from "@/lib/recruit";
import { guessCandidateInfo } from "@/lib/recruit-extract";
import { fetchWebPageText } from "@/lib/web-page-text";
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

export type IntakeRow = {
  /** Tên file hoặc link — thứ HR nhận ra được trên bảng kết quả. */
  source: string;
  ok: boolean;
  /** ok=true: id hồ sơ vừa tạo. ok=false: mã lỗi. */
  detail: string;
  /** Ba trường app tự đọc được — để HR thấy ngay app đọc được gì, không phải mở từng hồ sơ. */
  guessed?: { fullName: string | null; email: string | null; phone: string | null; nameSource: string | null };
};
export type UploadState = { error?: string; rows?: IntakeRow[] };

/**
 * Bóc text của một CV — best-effort, KHÔNG được ném: file không đọc được text vẫn phải tạo được hồ
 * sơ (đó chính là ca PDF ảnh scan / CV xuất từ Canva).
 *
 * ⚠ PHẢI truyền `maxChars`: mặc định của helper dùng chung là 6.000 ký tự, cắt mất phần lớn CV.
 * Đúng cái bẫy đã trả giá ở PUR-3a (HANDOVER 10.46) — cùng một helper, cùng một chỗ quên.
 */
async function cvTextOf(buffer: Buffer, mime: string): Promise<string> {
  try {
    const r = await extractTextFromFile(buffer, mime, { maxChars: MAX_CV_TEXT_CHARS });
    return r?.text ?? "";
  } catch {
    return "";
  }
}

/** Tạo MỘT hồ sơ từ (buffer + tên + mime), tự trích xuất tên/email/điện thoại. */
async function createCandidateFrom(args: {
  positionId: string;
  meId: string | null;
  buffer: Buffer;
  fileName: string;
  mime: string;
  size: number;
  cvUrl?: string | null;
  typedName?: string;
}): Promise<IntakeRow> {
  const { positionId, meId, buffer, fileName, mime, size } = args;
  let fileKey: string;
  try {
    fileKey = await saveCvFile(buffer, mime);
  } catch (e) {
    console.error("[RECRUIT] lỗi lưu CV:", e);
    return { source: fileName, ok: false, detail: "SAVE_FAILED" };
  }

  const text = await cvTextOf(buffer, mime);
  const guessed = guessCandidateInfo(text, fileName);
  // Thứ tự: HR gõ tay > app đoán được > tên file bỏ đuôi (để danh sách không có dòng trống).
  const fullName = (args.typedName || guessed.fullName || fileName.replace(/\.[^.]+$/, "")).slice(0, 120);

  const created = await prisma.candidate.create({
    data: {
      positionId,
      fullName,
      email: guessed.email,
      phone: guessed.phone,
      cvFileKey: fileKey,
      cvFileName: fileName.slice(0, 200),
      cvFileMime: mime,
      cvFileSize: size,
      cvUrl: args.cvUrl ?? null,
      createdById: meId,
    },
    select: { id: true },
  });
  await audit(created.id, "create", "*", guessed.nameSource ? `tên lấy từ ${guessed.nameSource}` : undefined);
  revalidate(created.id);
  return {
    source: fileName,
    ok: true,
    detail: created.id,
    guessed: { fullName: guessed.fullName, email: guessed.email, phone: guessed.phone, nameSource: guessed.nameSource },
  };
}

/**
 * HR nhận CV: chọn vị trí đang tuyển, rồi tải LÊN TỚI `MAX_CV_UPLOAD` file một lượt và/hoặc dán MỘT
 * link web (portfolio). Mỗi nguồn thành một hồ sơ riêng, trạng thái NEW.
 *
 * ⚠ App TỰ trích xuất tên · email · điện thoại ngay lúc nhận, bằng REGEX/heuristic — CỐ Ý KHÔNG gọi
 * AI. Tải 10 CV mà tự gọi AI là 10 lượt tính tiền diễn ra SAU LƯNG người dùng, ngược hẳn luật đang
 * áp cho `recruit.ai_parse` / `mkt.generate` / `clients.kb.generate`. Nút "AI đọc CV" ở trang chi
 * tiết vẫn còn nguyên cho phần sâu hơn (tóm tắt kinh nghiệm, kỹ năng, lương mong muốn).
 *
 * ⚠ Chỉ điều hướng khi MỌI nguồn đều thành công. Có nguồn hỏng thì Ở LẠI và trả bảng kết quả —
 * điều hướng đi là nuốt mất thông tin "nguồn nào không nhận được".
 */
export async function uploadCandidate(_prev: UploadState, formData: FormData): Promise<UploadState> {
  await requirePermission("recruit.manage");
  const meId = await getCurrentStaffId();

  const positionId = str(formData.get("positionId"));
  if (!positionId) return { error: "NO_POSITION" };
  const position = await prisma.jobPosition.findUnique({ where: { id: positionId }, select: { id: true, status: true } });
  if (!position) return { error: "NO_POSITION" };
  if (position.status === "CLOSED") return { error: "POSITION_CLOSED" };

  // ⚠ getAll, KHÔNG get — từ 24/08/2026 chọn được nhiều file một lượt.
  const files = formData.getAll("cv").filter((f): f is File => f instanceof File && f.size > 0);
  const link = str(formData.get("cvUrl"));
  if (files.length === 0 && !link) return { error: "NO_FILE" };
  if (files.length > MAX_CV_UPLOAD) return { error: "TOO_MANY_FILES" };

  let total = 0;
  for (const f of files) {
    if (f.size > MAX_CV_BYTES) return { error: "FILE_TOO_BIG" };
    if (!(CV_MIME_TYPES as readonly string[]).includes(f.type)) return { error: "FILE_TYPE" };
    total += f.size;
  }
  if (total > MAX_CV_TOTAL_BYTES) return { error: "TOTAL_TOO_BIG" };

  // Tên gõ tay chỉ áp khi CHỈ CÓ MỘT nguồn — nhiều nguồn thì một cái tên không thể đúng cho tất cả.
  const single = files.length + (link ? 1 : 0) === 1;
  const typedName = single ? str(formData.get("fullName")) : "";

  const rows: IntakeRow[] = [];
  for (const f of files) {
    rows.push(
      await createCandidateFrom({
        positionId,
        meId,
        buffer: Buffer.from(await f.arrayBuffer()),
        fileName: f.name,
        mime: f.type,
        size: f.size,
        typedName,
      }),
    );
  }

  if (link) {
    const page = await fetchWebPageText(link, (b, m, n) => extractTextFromFile(b, m, { maxChars: n }), MAX_CV_TEXT_CHARS);
    if (!page.ok) {
      rows.push({ source: link, ok: false, detail: "WEB_" + page.error });
    } else {
      // Lưu ẢNH CHỤP text của trang thành file .txt trong kho CV: trang web đổi nội dung hoặc biến
      // mất bất cứ lúc nào, còn hồ sơ tuyển dụng thì phải tra lại được đúng thứ HR đã đọc.
      let host = "web";
      try {
        host = new URL(page.finalUrl).hostname;
      } catch {
        host = "web";
      }
      const head = `Nguồn: ${page.finalUrl}\n` + (page.title ? `Tiêu đề: ${page.title}\n` : "");
      const snapshot = Buffer.from(`${head}\n${page.text}`, "utf8");
      rows.push(
        await createCandidateFrom({
          positionId,
          meId,
          buffer: snapshot,
          fileName: `${host}.txt`,
          mime: "text/plain",
          size: snapshot.byteLength,
          cvUrl: page.finalUrl,
          typedName,
        }),
      );
    }
  }

  const okRows = rows.filter((r) => r.ok);
  if (okRows.length === 0) return { error: rows[0]?.detail ?? "SAVE_FAILED", rows };
  if (okRows.length !== rows.length) return { rows }; // có nguồn hỏng → ở lại cho HR thấy

  // ⚠ Điều hướng ở SERVER, không trả id về rồi để client `router.push()`. Gọi router trong lúc
  // render là cập nhật một component khác giữa chừng — React cảnh báo "Cannot update a component
  // while rendering a different component" và hành vi không bảo đảm ở chế độ đồng thời.
  // `redirect()` phải nằm NGOÀI try/catch, nếu không nó bị nuốt (nó hoạt động bằng cách ném lỗi).
  if (okRows.length === 1) redirect(`/staff/recruit/candidates/${okRows[0].detail}`);
  redirect("/staff/recruit");
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
    // ⚠ PHẢI truyền maxChars: mặc định của helper là 6.000 ký tự, và `.slice(MAX_CV_TEXT_CHARS)`
    // phía dưới KHÔNG cứu được — chuỗi đã bị cắt trước khi tới đây. Bản trước quên chỗ này nên AI
    // chỉ đọc được ~1/4 CV, đúng cái bẫy đã trả giá ở PUR-3a (HANDOVER 10.46).
    const extracted = await extractTextFromFile(buffer, candidate.cvFileMime, { maxChars: MAX_CV_TEXT_CHARS });
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
    select: {
      id: true,
      candidateId: true,
      interviewerStaffId: true,
      status: true,
      candidate: { select: { position: { select: { isManagerial: true } } } },
    },
  });
  if (!interview) return { error: "NOT_FOUND" };
  if (interview.interviewerStaffId !== meId && !(await hasPermission("recruit.interview.manage"))) {
    return { error: "NOT_YOURS" };
  }
  if (interview.status === "CANCELLED") return { error: "CANCELLED" };

  const recommendation = str(formData.get("recommendation"));
  if (!isRecommendation(recommendation)) return { error: "NO_RECOMMENDATION" };

  // TD-2c — chấm theo THANG 100 CÓ TRỌNG SỐ.
  //
  // ⚠ Đọc bộ tiêu chí từ DB rồi mới nhận điểm, KHÔNG tin mã tiêu chí từ client: mã lạ bị bỏ, và mỗi
  // điểm bị KẸP vào [0, trọng số của CHÍNH mã đó]. Không kẹp thì nhét tay `score__EXPERTISE=999`
  // vào payload là tổng vọt lên — cùng lớp lỗi đã bịt ở AI chấm CV (TD-2a).
  // ⚠ TỔNG DO SERVER CỘNG, không nhận con số tổng từ form: màn hình chỉ hiện để người chấm nhìn.
  const scope = scopeForPosition(interview.candidate.position.isManagerial);
  const criteria = await loadCriteria("INTERVIEW", scope);

  // Bỏ trống một tiêu chí là hợp lệ (không phải tiêu chí nào cũng đánh giá được ở mọi vòng) — ô
  // trống tính 0 điểm khi cộng tổng nhưng KHÔNG lưu dòng điểm, để phân biệt "chấm 0" với "bỏ qua".
  const scores: { criterionCode: string; score: number; note: string | null }[] = [];
  const forTotal: { code: string; label: string; weight: number; score: number }[] = [];
  for (const c of criteria) {
    const raw = str(formData.get(`score__${c.code}`));
    const note = textOrNull(formData.get(`note__${c.code}`), 1000);
    const n = Number(raw);
    const has = raw !== "" && Number.isFinite(n);
    const clamped = has ? Math.min(c.weight, Math.max(0, Math.round(n))) : 0;
    forTotal.push({ code: c.code, label: c.label, weight: c.weight, score: clamped });
    if (has) scores.push({ criterionCode: c.code, score: clamped, note });
  }
  const { total, max } = computeTotal(forTotal);

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
        scope,
        totalScore: total,
        maxScore: max,
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
  // ADMIN là sàn cứng trong code nên luôn qua được; ngoài ra là HR_MANAGER + HR_STAFF.
  await requirePermission("recruit.manage");
  const candidateId = str(formData.get("candidateId"));
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      fullName: true,
      email: true,
      phone: true,
      status: true,
      cvFileKey: true,
      cvFileName: true,
      createdAt: true,
      position: { select: { title: true } },
      interviews: { select: { id: true } },
      offer: { select: { status: true } },
      _count: { select: { aiReviews: true, emailLogs: true } },
    },
  });
  if (!candidate) return { error: "NOT_FOUND" };
  // Đã phỏng vấn thì không xoá — dùng "Từ chối" để giữ lại lịch sử.
  if (candidate.interviews.length > 0) return { error: "HAS_INTERVIEWS" };
  // ⚠ Đã lập thư mời nhận việc = đã có cam kết với người NGOÀI công ty. Xoá hồ sơ lúc đó là mất dấu
  // vết của một cam kết đang treo; muốn đóng thì cho ứng viên TỪ CHỐI offer, đừng xoá.
  if (candidate.offer) return { error: "HAS_OFFER" };

  // ⚠ CHỤP ẢNH TRƯỚC KHI XOÁ — xoá ứng viên là xoá VĨNH VIỄN cả bản ghi lẫn file CV trên đĩa, và
  // cuốn theo mọi bản AI chấm điểm (cascade). Không có ảnh chụp thì sau này không ai biết đã từng
  // có hồ sơ nào ở đây, ai xoá, lúc nào. Cùng cách đã làm khi xoá nhân sự nghỉ việc (HANDOVER
  // 10.18) và xoá người liên hệ phía khách (10.43).
  // ⚠ `RecruitEmailLog.candidateId` là SetNull nên SỔ THƯ GIỮ NGUYÊN: thư đã gửi ra ngoài là bằng
  // chứng, không được biến mất theo hồ sơ. Ảnh chụp ghi lại số thư để người đọc audit biết còn dòng
  // sổ thư mồ côi ở đâu mà tra.
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: {
      entityType: "candidate",
      entityId: candidateId,
      field: "delete_snapshot",
      action: "DELETE",
      oldValue: JSON.stringify({
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        position: candidate.position.title,
        status: candidate.status,
        cvFileName: candidate.cvFileName,
        receivedAt: candidate.createdAt.toISOString(),
        aiReviews: candidate._count.aiReviews,
        emailsSent: candidate._count.emailLogs,
      }),
      reason: textOrNull(formData.get("reason"), 500),
      changedBy: staffId,
    },
  });

  await prisma.candidate.delete({ where: { id: candidateId } });
  // Xoá file SAU khi xoá bản ghi: hỏng ở bước xoá file thì còn lại một file mồ côi trên đĩa (vô
  // hại, dọn tay được), còn hỏng theo thứ tự ngược lại thì hồ sơ trỏ vào file không tồn tại.
  await deleteCvFile(candidate.cvFileKey);
  revalidate();
  return { ok: true };
}
