// Knowledge Base theo khách hàng — phần THUẦN, KHÔNG gọi Prisma.
//
// Nội dung bài học lưu dạng BLOCK có cấu trúc chứ không phải markdown/HTML. Lý do: repo cố ý
// không có markdown renderer (chống XSS — xem chú thích ở ai-shared.tsx), và block có cấu trúc
// cho phép AI ở đợt H3 sinh thẳng JSON đúng khuôn thay vì sinh văn bản rồi phải parse.
// Render bằng JSX text node nên React tự escape; không nơi nào dùng dangerouslySetInnerHTML.

import { z } from "zod";

export type LessonBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "terms"; items: { term: string; definition: string }[] };

export const LESSON_BLOCK_TYPES = ["heading", "paragraph", "bullets", "terms"] as const;
export type LessonBlockType = (typeof LESSON_BLOCK_TYPES)[number];

/** Trần chống bài học phình vô hạn (và chống prompt AI ở H3 trả về hàng trăm block). */
export const MAX_BLOCKS_PER_LESSON = 40;
/** Trần con của khối gạch đầu dòng / thuật ngữ — trình soạn thảo chặn thêm ở đúng số này. */
export const MAX_ITEMS_PER_BLOCK = 30;

/**
 * Trần cho các ô văn bản tự do NGOÀI blocks. Blocks đã bị Zod chặn từng trường rất chặt; sáu ô còn
 * lại chỉ kiểm `length < 2` nên cận trên thực tế là trần body của Server Action (30MB — xem
 * next.config.ts). Dán nhầm cả một brief đã convert vào "thông tin chung" là mọi lượt mở trang KB
 * của khách đó (và cả 4 pháp nhân nếu neo theo nhóm) phải tải vài MB HTML.
 */
export const MAX_GENERAL_NOTE = 20_000;
export const MAX_KB_NAME = 200;
export const MAX_KB_NOTE = 500;
export const MAX_KB_FILE_NAME = 200;

const headingBlock = z.object({ type: z.literal("heading"), text: z.string().trim().min(1).max(200) });
const paragraphBlock = z.object({ type: z.literal("paragraph"), text: z.string().trim().min(1).max(4000) });
const bulletsBlock = z.object({
  type: z.literal("bullets"),
  items: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
});
const termsBlock = z.object({
  type: z.literal("terms"),
  items: z
    .array(z.object({ term: z.string().trim().min(1).max(120), definition: z.string().trim().min(1).max(1000) }))
    .min(1)
    .max(30),
});

/** Dùng ở MỌI đường ghi blocks: PIC sửa tay (H2) và AI sinh (H3). */
export const lessonBlocksSchema = z
  .array(z.discriminatedUnion("type", [headingBlock, paragraphBlock, bulletsBlock, termsBlock]))
  .max(MAX_BLOCKS_PER_LESSON);

/**
 * Đọc blocks từ cột `blocksJson`. Dữ liệu hỏng/không đúng khuôn thì trả mảng rỗng thay vì ném —
 * một bài học lỗi không được làm sập cả trang KB.
 *
 * ⚠ `corrupt` PHẢI được dùng ở trang SỬA. Không có cờ này thì bài hỏng hiện ra y hệt bài rỗng,
 * PIC mở trình soạn thảo thấy trắng rồi bấm Lưu là GHI ĐÈ nội dung cũ bằng `[]` — mất trắng, im
 * lặng, không có bản sao nào. Ca có thật khi schema bị siết ở đợt sau hoặc AI (H3) ghi khuôn lạ.
 */
export function readLessonBlocks(json: string): { blocks: LessonBlock[]; corrupt: boolean } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { blocks: [], corrupt: true };
  }
  const parsed = lessonBlocksSchema.safeParse(raw);
  if (parsed.success) return { blocks: parsed.data, corrupt: false };
  // Mảng rỗng đúng khuôn đã lọt nhánh trên, nên tới đây mà không phải mảng rỗng nghĩa là hỏng thật.
  return { blocks: [], corrupt: true };
}

/** Đường ĐỌC (trang xem bài) — chỉ cần nội dung, bài hỏng hiện như bài chưa có nội dung. */
export function parseLessonBlocks(json: string): LessonBlock[] {
  return readLessonBlocks(json).blocks;
}

/**
 * Khuôn JSON mà AI phải trả (H3). `aiChatJson` chỉ ép kiểu `as T` chứ KHÔNG validate — nên mọi
 * output của model bắt buộc đi qua một trong hai schema này trước khi chạm DB.
 */
export const kbOutlineSchema = z.object({
  topics: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(200),
        lessons: z.array(z.object({ title: z.string().trim().min(2).max(200) })).min(1).max(8),
      }),
    )
    .min(1)
    .max(8),
});

export const kbLessonContentSchema = z.object({ blocks: lessonBlocksSchema });

/** Đối tượng mà KB neo vào: nhóm nếu khách có nhóm, ngược lại là chính khách. */
export type KbAnchor = { kind: "GROUP"; id: string } | { kind: "CLIENT"; id: string };

/**
 * ⚠ Gọi ở MỌI request đọc/ghi KB, không cache vào cột nào. Khách được gán vào nhóm là lập tức
 * nhìn thấy kho của nhóm; gỡ khỏi nhóm là quay về kho riêng cũ (vẫn còn nguyên trong DB).
 */
export function resolveKbAnchor(client: { id: string; groupId: string | null }): KbAnchor {
  return client.groupId ? { kind: "GROUP", id: client.groupId } : { kind: "CLIENT", id: client.id };
}

/**
 * Trần cỡ tệp + allowlist MIME nằm ở file THUẦN này chứ không ở `client-kb-storage.ts`: ô chọn
 * tệp là client component, mà storage import `fs/promises` — kéo nó vào bundle trình duyệt là
 * build hỏng ngay ("Module not found: Can't resolve 'fs/promises'"). Storage import ngược lại.
 */
export const MAX_CLIENT_KB_FILE_BYTES = 25 * 1024 * 1024; // 25MB — brand guideline dạng scan khá nặng

export const CLIENT_KB_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const KB_SOURCE_KINDS = ["BRAND_GUIDELINE", "BRIEF", "OTHER"] as const;
export type KbSourceKind = (typeof KB_SOURCE_KINDS)[number];

export function isKbSourceKind(v: string): v is KbSourceKind {
  return (KB_SOURCE_KINDS as readonly string[]).includes(v);
}

/** Đếm nhanh để hiện trên danh sách topic — bài đã đăng / tổng số bài. */
export function countPublished(lessons: { status: string }[]): { published: number; total: number } {
  return { published: lessons.filter((l) => l.status === "PUBLISHED").length, total: lessons.length };
}

// ── H3: câu hỏi kiểm tra ──────────────────────────────────

/** Đúng 4 phương án cho mọi câu — cố định, không cho cấu hình (kế hoạch H3 đã cắt). */
export const QUIZ_OPTION_COUNT = 4;
/** Số câu AI sinh mỗi lượt. Hằng số, không đưa vào setting. */
export const QUIZ_AI_QUESTION_COUNT = 5;
export const DEFAULT_KB_PASS_PCT = 80;
/**
 * Trần số lượt làm bài MỖI NGÀY cho một chủ đề. Theo NGÀY chứ không phải trần tuyệt đối: trần
 * tuyệt đối khoá vĩnh viễn người trượt hết lượt và bắt phải có màn hình admin mở khoá.
 */
export const DEFAULT_KB_MAX_ATTEMPTS_PER_DAY = 3;

/**
 * Đảo thứ tự hiển thị phương án — HÀM THUẦN (nhận nguồn ngẫu nhiên để test được).
 *
 * ⚠ Trả kèm `originalIndex` và ô radio phải gửi CHÍNH SỐ ĐÓ lên. Nhờ vậy bộ chấm không phải biết
 * gì về việc đảo: `correctIndex` trong DB vẫn trỏ đúng phương án cũ. Đảo mà gửi chỉ số HIỂN THỊ
 * là chấm sai toàn bộ.
 *
 * Mục đích: chặn học vẹt vị trí ("đáp án luôn là ô thứ 2") và làm việc dò đáp án bằng cách làm
 * lại nhiều lượt trở nên vô nghĩa vì vị trí đổi mỗi lần tải trang.
 */
export function shuffleOptions(
  options: QuizOption[],
  rand: () => number = Math.random,
): { text: QuizOption; originalIndex: number }[] {
  const arr = options.map((text, originalIndex) => ({ text, originalIndex }));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export type QuizOption = string;
export type QuizQuestionInput = {
  prompt: string;
  options: QuizOption[];
  correctIndex: number;
  explanation?: string;
};

/**
 * Dùng ở MỌI đường ghi câu hỏi: AI sinh và (về sau) PIC nhập tay. `correctIndex` bị chặn trong
 * [0,3] ngay tại đây — model đôi khi trả 1..4 theo thói quen người, để lọt là câu đó không ai
 * trả lời đúng được và người học trượt oan mà không hiểu vì sao.
 */
export const quizQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        prompt: z.string().trim().min(5).max(500),
        options: z.array(z.string().trim().min(1).max(300)).length(QUIZ_OPTION_COUNT),
        correctIndex: z.number().int().min(0).max(QUIZ_OPTION_COUNT - 1),
        explanation: z.string().trim().max(600).optional(),
      }),
    )
    .min(1)
    .max(20),
});

/** Đọc `optionsJson`. Sai khuôn thì trả mảng rỗng — câu đó bị loại khỏi bài. */
export function parseQuizOptions(json: string): QuizOption[] {
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    const items = raw.filter((x): x is string => typeof x === "string");
    return items.length === QUIZ_OPTION_COUNT ? items : [];
  } catch {
    return [];
  }
}

/**
 * Câu có DÙNG ĐƯỢC không — MỘT nguồn sự thật cho cả trang làm bài lẫn lúc chấm điểm.
 *
 * ⚠ Trang và bộ chấm PHẢI lọc bằng cùng hàm này. Trước khi gom lại, trang lọc câu hỏng còn bộ chấm
 * thì không: người dùng thấy 4 câu, trả lời đúng cả 4, vẫn bị chấm 4/5 = 80% — trượt oan vì một câu
 * họ chưa từng nhìn thấy, và không có cách nào biết vì sao. Đã tái hiện bằng số trước khi sửa.
 *
 * Loại luôn câu có `correctIndex` ngoài dải: câu đó không ai trả lời đúng được.
 */
export function isUsableQuestion(q: { optionsJson: string; correctIndex: number }): boolean {
  return (
    parseQuizOptions(q.optionsJson).length === QUIZ_OPTION_COUNT &&
    Number.isInteger(q.correctIndex) &&
    q.correctIndex >= 0 &&
    q.correctIndex < QUIZ_OPTION_COUNT
  );
}

export type GradedQuiz = {
  score: number;
  total: number;
  /** Phần trăm làm tròn xuống — 4/5 = 80, 3/5 = 60. */
  pct: number;
  passed: boolean;
  /** Theo từng câu, để trang kết quả chỉ ra chỗ sai kèm giải thích. */
  detail: { questionId: string; chosen: number | null; correctIndex: number; ok: boolean }[];
};

/**
 * Chấm bài — HÀM THUẦN, chạy phía server, không bao giờ tin điểm do client gửi lên.
 *
 * Bỏ trống một câu = SAI (chosen null), cố ý: không cho lách bằng cách chỉ trả lời câu chắc chắn.
 * `passPct` truyền vào là ngưỡng ĐANG hiệu lực lúc chấm và được lưu kèm lượt làm — đổi setting
 * sau này không chấm lại quá khứ.
 */
export function gradeQuiz(
  questions: { id: string; correctIndex: number }[],
  answers: Record<string, number | null>,
  passPct: number,
): GradedQuiz {
  const detail = questions.map((q) => {
    const chosen = answers[q.id];
    const picked = typeof chosen === "number" && Number.isInteger(chosen) ? chosen : null;
    return { questionId: q.id, chosen: picked, correctIndex: q.correctIndex, ok: picked === q.correctIndex };
  });
  const score = detail.filter((d) => d.ok).length;
  const total = questions.length;
  const pct = total === 0 ? 0 : Math.floor((score * 100) / total);
  return { score, total, pct, passed: total > 0 && pct >= passPct, detail };
}

// ── H3: gói nguyên liệu cho AI ────────────────────────────

/**
 * Ngân sách ký tự cho phần trích tài liệu nhét vào prompt. 24k ký tự ≈ 8k token, còn chỗ cho phần
 * hướng dẫn và phần model trả lời trong trần 90s/2400 token của `aiChat`.
 */
export const KB_SOURCES_CHAR_BUDGET = 24_000;

/**
 * Xếp text các tài liệu vào ngân sách — HÀM THUẦN.
 *
 * MỚI NHẤT TRƯỚC: brand guideline bản 2026 phải thắng bản 2024 khi không đủ chỗ cho cả hai.
 * Tài liệu bị bỏ vẫn được TRẢ TÊN ra (`skipped`) để prompt nói rõ "có tài liệu này nhưng chưa
 * đọc" — im lặng thì người dùng tưởng AI đã đọc hết rồi tin bài học thiếu.
 */
export function packSourceTexts(
  items: { name: string; text: string | null }[],
  budget = KB_SOURCES_CHAR_BUDGET,
): { text: string; skipped: string[] } {
  const SEP = "\n\n";
  const chunks: string[] = [];
  const skipped: string[] = [];
  let left = budget;
  for (const it of items) {
    const body = (it.text ?? "").trim();
    if (!body) {
      skipped.push(it.name);
      continue;
    }
    const header = `--- ${it.name} ---\n`;
    // Dấu nối giữa hai tài liệu cũng tốn chỗ — bỏ quên là tổng vượt ngân sách đúng 2 ký tự mỗi mối nối.
    const overhead = header.length + (chunks.length ? SEP.length : 0);
    // Chừa tối thiểu 500 ký tự thân bài, dưới mức đó thì trích chỉ còn là mẩu vô nghĩa.
    if (left - overhead < 500) {
      skipped.push(it.name);
      continue;
    }
    const room = left - overhead;
    // Cắt còn `room - 1` khi phải cắt: dấu … cũng tốn một ký tự, cộng thẳng vào là tràn ngân sách
    // đúng 1 ký tự mỗi lần cắt — đủ để vượt trần token của model trong ca xấu.
    const slice = body.length <= room ? body : `${body.slice(0, room - 1)}…`;
    chunks.push(header + slice);
    left -= overhead + slice.length;
  }
  return { text: chunks.join(SEP), skipped };
}

// ── H3: bảng tuân thủ ─────────────────────────────────────

export type ComplianceTopic = {
  topicId: string;
  name: string;
  /** Chủ đề "phải đạt" = có ≥1 bài ĐÃ ĐĂNG **và** ≥1 câu hỏi đang bật. */
  required: boolean;
};

export type ComplianceRow = {
  staffId: string;
  /** Đã đạt bao nhiêu / tổng số chủ đề phải đạt. */
  passed: number;
  required: number;
  /** N/A khi kho chưa có chủ đề nào "phải đạt" — KHÔNG cảnh báo, vì lỗi thuộc về người soạn. */
  status: "PASS" | "PENDING" | "NA";
  missingTopicIds: string[];
};

/**
 * Trạng thái học của từng người. Đây là CẢNH BÁO MỀM (quyết định của chủ dự án): không có chỗ
 * nào trong app chặn thao tác vì chưa học xong — chỉ hiện badge và bảng.
 *
 * Chủ đề chưa có bài đăng hoặc chưa có câu hỏi thì KHÔNG tính vào mẫu số: kho đang soạn dở không
 * được làm cả công ty đỏ rực.
 */
export function computeCompliance(
  topics: ComplianceTopic[],
  staffIds: string[],
  passedPairs: { staffId: string; topicId: string }[],
): ComplianceRow[] {
  const required = topics.filter((t) => t.required);
  const passedBy = new Map<string, Set<string>>();
  for (const p of passedPairs) {
    if (!passedBy.has(p.staffId)) passedBy.set(p.staffId, new Set());
    passedBy.get(p.staffId)!.add(p.topicId);
  }
  return staffIds.map((staffId) => {
    const done = passedBy.get(staffId) ?? new Set<string>();
    const missing = required.filter((t) => !done.has(t.topicId));
    return {
      staffId,
      passed: required.length - missing.length,
      required: required.length,
      status: required.length === 0 ? "NA" : missing.length === 0 ? "PASS" : "PENDING",
      missingTopicIds: missing.map((t) => t.topicId),
    };
  });
}
