"use server";

import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { getAiVisibility } from "@/lib/permissions";
import { AiError, aiChatJson, isAiConfigured } from "@/lib/ai/deepseek";
import { parseAiDoc, type AiDoc } from "@/lib/doc-blocks";
import {
  boardReportPrompt,
  brainstormPrompt,
  canvaBriefPrompt,
  contentWriterPrompt,
  costSheetAnalysisPrompt,
  industryTrendGroundedPrompt,
  industryTrendPrompt,
  withDocFormat,
} from "@/lib/ai/prompts";
import { buildBoardReportInput, buildBrainstormInput, buildCanvaBriefInput, buildContentWriterInput, buildCostSheetSnapshot } from "@/lib/ai/context";
import { saveProjectFilesFromFormData } from "@/lib/ai/attachments";
import { extractTextFromFile } from "@/lib/ai/extract-text";
import { AI_FILE_MIME_TYPES, MAX_AI_FILE_BYTES } from "@/lib/ai-file-storage";
import { getStringSetting } from "@/lib/settings";
import { documentDraftPrompt } from "@/lib/ai/document-prompts";
import { bankReconPrompt } from "@/lib/ai/bank-recon-prompts";
import { buildReconBlocks, reconSummaryForAi, reconcile } from "@/lib/bank-recon";
import { parsePlanWorkbook, parseStatementWorkbook } from "@/lib/bank-recon-parse";
import { docSchema } from "@/lib/doc-blocks";
import { MAX_DOCUMENT_BRIEF, MAX_DOCUMENT_REF_CHARS, resolveDocumentType } from "@/lib/ai/document-types";
import { buildIndustryQuery, isWebSearchConfigured, searchWeb } from "@/lib/ai/websearch";
import { requirePermission } from "@/lib/permissions";

/**
 * Server action cho các tính năng AI. Mọi action đều:
 *  - yêu cầu đã đăng nhập (API key tốn tiền, không để lộ endpoint cho người lạ),
 *  - kiểm phạm vi hiển thị theo phòng ban/người (getAiVisibility) — ĐỊNH TUYẾN LẠI ở server, không
 *    tin việc ẩn UI (đúng quy ước "hiện UI + re-check action" toàn app),
 *  - nạp dữ liệu thật từ DB rồi mới gọi model (chống bịa số),
 *  - trả về markdown để UI render, kèm mã lỗi đã dịch sang i18n.
 */

export type AiState = {
  /**
   * Kết quả AI dưới dạng TÀI LIỆU CÓ CẤU TRÚC — nhờ vậy cùng một dữ liệu ra được 3 đích: màn hình,
   * trang in (PDF) và file Word. Trước đây là text thuần nên không format được gì (xem doc-blocks.ts).
   */
  doc?: AiDoc;
  /** Chỉ còn cho chỗ hiển thị text ĐÃ LƯU từ trước (báo cáo insights MKT) — công cụ mới dùng `doc`. */
  text?: string;
  error?: string;
  /** true = câu trả lời dựa trên nguồn web thật (có link kiểm chứng); false/undefined = kiến thức chung. */
  grounded?: boolean;
  sourceCount?: number;
  /** Số file đính kèm vừa lưu thành công vào thư viện dự án (Brainstorm/Content/Canva). */
  savedFiles?: number;
  /** Tên file bị từ chối (quá lớn/sai định dạng) — vẫn chạy AI bình thường, chỉ báo để người dùng biết. */
  rejectedFiles?: string[];
};

/** Dịch AiError sang câu tiếng Việt/Anh. Lỗi kỹ thuật chỉ ghi log server, không hiện cho user. */
async function toMessage(e: unknown): Promise<string> {
  const t = await getTranslations("ai.errors");
  if (e instanceof AiError) {
    if (e.detail) console.error(`[AI] ${e.code}:`, e.detail);
    return t(e.code);
  }
  console.error("[AI] lỗi không xác định:", e);
  return t("UNKNOWN");
}

/** Chốt chung: phải đăng nhập + đã cấu hình API key. */
async function guard(): Promise<string | null> {
  const t = await getTranslations("ai.errors");
  const staffId = await getCurrentStaffId();
  if (!staffId) return t("NOT_LOGGED_IN");
  if (!isAiConfigured()) return t("NOT_CONFIGURED");
  return null;
}

// ───────────────────────── 1. Phân tích CO/CE ─────────────────────────

export async function analyzeCostSheet(projectId: string, _prev: AiState, _formData: FormData): Promise<AiState> {
  await requirePermission("ai.costsheet");
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const t = await getTranslations("ai.errors");
  const vis = await getAiVisibility();
  if (!vis.canCostSheet) return { error: t("NOT_ALLOWED") };

  try {
    const snap = await buildCostSheetSnapshot(projectId);
    if (!snap) return { error: t("NO_COSTSHEET") };

    // temperature thấp: đây là bài toán số liệu, cần bám dữ liệu chứ không cần sáng tạo.
    const doc = parseAiDoc(await aiChatJson(withDocFormat(costSheetAnalysisPrompt(snap)), { temperature: 0.2, maxTokens: 6000 }));
    if (!doc) return { error: t("BAD_FORMAT") };
    return { doc };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 2. Brainstorm ý tưởng ─────────────────────────

export async function brainstormIdeas(_prev: AiState, formData: FormData): Promise<AiState> {
  await requirePermission("ai.brainstorm");
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const t = await getTranslations("ai.errors");
  const vis = await getAiVisibility();
  if (!vis.canBrainstorm) return { error: t("NOT_ALLOWED") };

  const projectId = String(formData.get("projectId") ?? "");
  const note = String(formData.get("note") ?? "");
  if (!projectId) return { error: t("NO_PROJECT") };

  try {
    const staffId = await getCurrentStaffId();
    const { savedCount, rejected } = await saveProjectFilesFromFormData(projectId, formData, staffId);

    const input = await buildBrainstormInput(projectId, note);
    if (!input) return { error: t("NO_PROJECT") };

    // temperature cao: brainstorm cần đa dạng ý tưởng.
    const doc = parseAiDoc(await aiChatJson(withDocFormat(brainstormPrompt(input)), { temperature: 0.9, maxTokens: 6000 }));
    if (!doc) return { error: t("BAD_FORMAT") };
    return { doc, savedFiles: savedCount, rejectedFiles: rejected.length ? rejected : undefined };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 2b. Viết bài / Content ─────────────────────────

export async function writeContent(_prev: AiState, formData: FormData): Promise<AiState> {
  await requirePermission("ai.content");
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const t = await getTranslations("ai.errors");
  const vis = await getAiVisibility();
  if (!vis.canContent) return { error: t("NOT_ALLOWED") };

  const projectId = String(formData.get("projectId") ?? "");
  const note = String(formData.get("note") ?? "");
  if (!projectId) return { error: t("NO_PROJECT") };

  try {
    const staffId = await getCurrentStaffId();
    const { savedCount, rejected } = await saveProjectFilesFromFormData(projectId, formData, staffId);

    const input = await buildContentWriterInput(projectId, note);
    if (!input) return { error: t("NO_PROJECT") };

    const doc = parseAiDoc(await aiChatJson(withDocFormat(contentWriterPrompt(input)), { temperature: 0.7, maxTokens: 6000 }));
    if (!doc) return { error: t("BAD_FORMAT") };
    return { doc, savedFiles: savedCount, rejectedFiles: rejected.length ? rejected : undefined };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 3. Brief thiết kế cho Canva ─────────────────────────

export async function generateCanvaBrief(_prev: AiState, formData: FormData): Promise<AiState> {
  await requirePermission("ai.canva");
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const t = await getTranslations("ai.errors");
  const vis = await getAiVisibility();
  if (!vis.canCanva) return { error: t("NOT_ALLOWED") };

  const projectId = String(formData.get("projectId") ?? "");
  const deliverable = String(formData.get("deliverable") ?? "").trim();
  const note = String(formData.get("note") ?? "");
  if (!projectId) return { error: t("NO_PROJECT") };
  if (!deliverable) return { error: t("MISSING_INPUT") };

  try {
    const staffId = await getCurrentStaffId();
    const { savedCount, rejected } = await saveProjectFilesFromFormData(projectId, formData, staffId);

    const input = await buildCanvaBriefInput(projectId, deliverable, note);
    if (!input) return { error: t("NO_PROJECT") };

    const doc = parseAiDoc(await aiChatJson(withDocFormat(canvaBriefPrompt(input)), { temperature: 0.6, maxTokens: 6000 }));
    if (!doc) return { error: t("BAD_FORMAT") };
    return { doc, savedFiles: savedCount, rejectedFiles: rejected.length ? rejected : undefined };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 4. Báo cáo BGĐ ─────────────────────────

export async function generateBoardReport(_prev: AiState, _formData: FormData): Promise<AiState> {
  await requirePermission("ai.board_report");
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const t = await getTranslations("ai.errors");
  // Báo cáo này gộp số liệu toàn công ty (margin, công nợ, tạm ứng) — chỉ đúng 3 người BGĐ (+ all-access).
  const vis = await getAiVisibility();
  if (!vis.canBoardReport) return { error: t("EXEC_ONLY") };

  try {
    const input = await buildBoardReportInput();
    const doc = parseAiDoc(await aiChatJson(withDocFormat(boardReportPrompt(input)), { temperature: 0.25, maxTokens: 6000 }));
    if (!doc) return { error: t("BAD_FORMAT") };
    return { doc };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 5. Xu hướng ngành ─────────────────────────

export async function askIndustryTrend(_prev: AiState, formData: FormData): Promise<AiState> {
  await requirePermission("ai.trend");
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const t = await getTranslations("ai.errors");
  const vis = await getAiVisibility();
  if (!vis.canTrend) return { error: t("NOT_ALLOWED") };

  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { error: t("MISSING_INPUT") };

  try {
    // Có cấu hình tìm kiếm web → đọc nguồn thật trước, model chỉ tổng hợp và phải dẫn link.
    // Không có (hoặc tìm không ra) → rơi về chế độ kiến thức chung, cấm bịa tên/số liệu.
    const sources = isWebSearchConfigured() ? await searchWeb(buildIndustryQuery(question)) : [];

    if (sources.length > 0) {
      const doc = parseAiDoc(
        await aiChatJson(withDocFormat(industryTrendGroundedPrompt(question, sources)), {
          temperature: 0.3, // thấp: nhiệm vụ là tổng hợp nguồn, không phải sáng tạo
          maxTokens: 6000,
        }),
      );
      if (!doc) return { error: t("BAD_FORMAT") };
      return { doc, grounded: true, sourceCount: sources.length };
    }

    const doc = parseAiDoc(await aiChatJson(withDocFormat(industryTrendPrompt(question)), { temperature: 0.7, maxTokens: 6000 }));
    if (!doc) return { error: t("BAD_FORMAT") };
    return { doc, grounded: false };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ─────────────────────────────────────────────────────────
// Panel AI nổi — nạp đúng thứ trang /ai đang nạp phía server.
// ─────────────────────────────────────────────────────────

/**
 * Quyền + danh sách dự án cho panel AI.
 *
 * KHÔNG gác bằng một mã quyền đơn lẻ: panel gom 6 công cụ, mỗi công cụ một quyền riêng và
 * chính các action chạy AI đã tự requirePermission("ai.*"). Ở đây chỉ trả về quyền CỦA CHÍNH
 * người gọi; ai không có công cụ nào thì không nhận được danh sách dự án.
 */
export async function loadAiPanel(): Promise<{ vis: Awaited<ReturnType<typeof getAiVisibility>>; options: { id: string; label: string }[]; configured: boolean; webSearchOn: boolean }> {
  const vis = await getAiVisibility();
  const anyTool = vis.canBrainstorm || vis.canContent || vis.canCanva || vis.canCostSheet || vis.canBoardReport || vis.canTrend;
  if (!anyTool) return { vis, options: [], configured: isAiConfigured(), webSearchOn: false };

  const projects = await prisma.project.findMany({
    where: { status: { code: { notIn: ["FAILED", "CANCELED"] } } },
    select: { id: true, code: true, name: true },
    orderBy: { code: "desc" },
    take: 200,
  });
  return {
    vis,
    options: projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` })),
    configured: isAiConfigured(),
    webSearchOn: isWebSearchConfigured(),
  };
}

// ───────────────────────── 7. Soạn thảo văn bản hành chính / nhân sự / kế toán ─────────────────

/**
 * Soạn văn bản theo LOẠI (quyết định, thông báo, công văn, tờ trình, biên bản…).
 *
 * ⚠ KHÔNG LƯU GÌ CẢ — quyết định chủ dự án 20/08/2026: "nội dung AI làm ra thì user phải lưu xuống
 * máy luôn, không lưu lại trên app". Cụ thể:
 *  - File mẫu tham chiếu đọc trong BỘ NHỚ rồi bỏ. **CỐ Ý không gọi `saveProjectFilesFromFormData`**
 *    như 3 công cụ Brainstorm/Content/Canva — hàm đó ghi file vào `ProjectFile` của dự án và ai xem
 *    được dự án thì tải về được. Văn bản nhân sự/kế toán không được nằm trong kho file dự án.
 *  - Bản soạn ra không ghi DB. Người dùng bấm Tải Word/PDF; F5 là mất.
 * Đổi hành vi này là đổi một quyết định về DỮ LIỆU, phải hỏi chủ dự án.
 *
 * ⚠ Nội dung VẪN đi sang DeepSeek (API nước ngoài) — "không lưu trong app" khác "không rời công ty".
 * Hộp xác nhận ở giao diện nói rõ điều đó.
 */
export async function draftDocument(_prev: AiState, formData: FormData): Promise<AiState> {
  await requirePermission("ai.document");
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const t = await getTranslations("ai.errors");
  const type = resolveDocumentType(String(formData.get("docType") ?? ""));
  const brief = String(formData.get("brief") ?? "").trim().slice(0, MAX_DOCUMENT_BRIEF);
  if (!type || !brief) return { error: t("MISSING_INPUT") };
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 300) || null;

  try {
    // File mẫu: đọc text rồi BỎ. Sai định dạng/quá lớn/không bóc được text thì vẫn soạn bình thường,
    // chỉ mất phần tham chiếu — chặn cả lượt chạy vì một file hỏng là bắt người dùng làm lại từ đầu.
    let referenceText: string | null = null;
    let referenceName: string | null = null;
    const file = formData.get("reference");
    if (file instanceof File && file.size > 0 && file.size <= MAX_AI_FILE_BYTES && (AI_FILE_MIME_TYPES as readonly string[]).includes(file.type)) {
      const extracted = await extractTextFromFile(Buffer.from(await file.arrayBuffer()), file.type, { maxChars: MAX_DOCUMENT_REF_CHARS });
      if (extracted?.text.trim()) {
        referenceText = extracted.text;
        referenceName = file.name || null;
      }
    }

    const companyName = await getStringSetting("company", "legal_name_vi", "Công ty Cổ phần Tiếp thị Tân Cường Minh");
    // temperature thấp: văn bản hành chính cần đúng khuôn, không cần sáng tạo.
    const doc = parseAiDoc(
      await aiChatJson(withDocFormat(documentDraftPrompt({ type, subject, brief, referenceText, referenceName, companyName })), {
        temperature: 0.3,
        maxTokens: 6000,
      }),
    );
    if (!doc) return { error: t("BAD_FORMAT") };
    return { doc };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 8. Đối chiếu chi ngân hàng (kế toán) ────────────────────────────────

/**
 * So kế hoạch chi (file Excel, mỗi sheet là một ngày duyệt lệnh) với sao kê ngân hàng, chỉ ra khoản
 * nào chưa đi được để kế toán lập lại lệnh.
 *
 * ⚠ PHẦN KHỚP DO CODE LÀM (`reconcile`), AI CHỈ NHẬN XÉT. Lý do đầy đủ ở đầu `lib/bank-recon.ts`:
 * báo nhầm 'rớt' là kế toán chi trùng, báo nhầm 'đã chi' là NCC không nhận được tiền. Bảng kết quả
 * dựng xong TRƯỚC khi gọi AI — AI lỗi thì vẫn trả về bảng đúng, chỉ thiếu phần nhận xét.
 *
 * ⚠ KHÔNG LƯU GÌ: hai file đọc trong bộ nhớ rồi bỏ (cùng quyết định với công cụ soạn thảo, mục
 * 10.50). Sao kê mang số dư và toàn bộ dòng tiền công ty — không có lý do gì để nó nằm lại trên đĩa.
 */
export async function reconcileBankPayments(_prev: AiState, formData: FormData): Promise<AiState> {
  await requirePermission("ai.bank_recon");
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const t = await getTranslations("ai.errors");
  const planFile = formData.get("planFile");
  const stFile = formData.get("statementFile");
  if (!(planFile instanceof File) || !(stFile instanceof File) || planFile.size === 0 || stFile.size === 0) {
    return { error: t("MISSING_INPUT") };
  }
  for (const file of [planFile, stFile]) {
    if (file.size > MAX_AI_FILE_BYTES) return { error: t("TOO_BIG") };
    if (file.type !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return { error: t("BAD_XLSX") };
  }

  try {
    const plan = await parsePlanWorkbook(Buffer.from(await planFile.arrayBuffer()));
    const st = await parseStatementWorkbook(Buffer.from(await stFile.arrayBuffer()));
    if (!plan.rows.length) return { error: t("PLAN_EMPTY") };
    if (!st || !st.rows.length) return { error: t("STATEMENT_EMPTY") };

    const result = reconcile(plan.rows, st.rows);
    const blocks = buildReconBlocks(result, {
      planFile: planFile.name || "kế hoạch chi",
      statementFile: stFile.name || "sao kê",
      dates: [...new Set(plan.rows.map((r) => r.approvedDate))],
    });

    // Bảng đã xong. AI chỉ nối thêm nhận xét — hỏng thì bỏ qua, KHÔNG để mất kết quả đối chiếu.
    let commentary: typeof blocks = [];
    try {
      const raw = await aiChatJson(withDocFormat(bankReconPrompt(reconSummaryForAi(result))), { temperature: 0.2, maxTokens: 4000 });
      const parsed = docSchema.safeParse(raw);
      if (parsed.success) commentary = parsed.data.blocks;
    } catch (e) {
      console.error("[AI] đối chiếu ngân hàng: phần nhận xét lỗi, vẫn trả bảng:", e);
    }

    const title = `Đối chiếu chi ngân hàng${result.missing.length ? ` — ${result.missing.length} khoản chưa đi được` : " — khớp đủ"}`;
    return {
      doc: {
        title,
        blocks: commentary.length ? [...blocks, { type: "heading" as const, level: 1 as const, text: "Nhận xét của trợ lý" }, ...commentary] : blocks,
      },
    };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}
