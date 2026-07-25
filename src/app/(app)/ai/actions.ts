"use server";

import { getTranslations } from "next-intl/server";
import { getCurrentStaffId } from "@/lib/current-staff";
import { getAiVisibility } from "@/lib/permissions";
import { AiError, aiChat, isAiConfigured } from "@/lib/ai/deepseek";
import {
  boardReportPrompt,
  brainstormPrompt,
  canvaBriefPrompt,
  contentWriterPrompt,
  costSheetAnalysisPrompt,
  industryTrendGroundedPrompt,
  industryTrendPrompt,
} from "@/lib/ai/prompts";
import { buildBoardReportInput, buildBrainstormInput, buildCanvaBriefInput, buildContentWriterInput, buildCostSheetSnapshot } from "@/lib/ai/context";
import { saveProjectFilesFromFormData } from "@/lib/ai/attachments";
import { buildIndustryQuery, isWebSearchConfigured, searchWeb } from "@/lib/ai/websearch";

/**
 * Server action cho các tính năng AI. Mọi action đều:
 *  - yêu cầu đã đăng nhập (API key tốn tiền, không để lộ endpoint cho người lạ),
 *  - kiểm phạm vi hiển thị theo phòng ban/người (getAiVisibility) — ĐỊNH TUYẾN LẠI ở server, không
 *    tin việc ẩn UI (đúng quy ước "hiện UI + re-check action" toàn app),
 *  - nạp dữ liệu thật từ DB rồi mới gọi model (chống bịa số),
 *  - trả về markdown để UI render, kèm mã lỗi đã dịch sang i18n.
 */

export type AiState = {
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
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const t = await getTranslations("ai.errors");
  const vis = await getAiVisibility();
  if (!vis.canCostSheet) return { error: t("NOT_ALLOWED") };

  try {
    const snap = await buildCostSheetSnapshot(projectId);
    if (!snap) return { error: t("NO_COSTSHEET") };

    // temperature thấp: đây là bài toán số liệu, cần bám dữ liệu chứ không cần sáng tạo.
    const { text } = await aiChat(costSheetAnalysisPrompt(snap), { temperature: 0.2, maxTokens: 2600 });
    return { text };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 2. Brainstorm ý tưởng ─────────────────────────

export async function brainstormIdeas(_prev: AiState, formData: FormData): Promise<AiState> {
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
    const { text } = await aiChat(brainstormPrompt(input), { temperature: 0.9, maxTokens: 2600 });
    return { text, savedFiles: savedCount, rejectedFiles: rejected.length ? rejected : undefined };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 2b. Viết bài / Content ─────────────────────────

export async function writeContent(_prev: AiState, formData: FormData): Promise<AiState> {
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

    const { text } = await aiChat(contentWriterPrompt(input), { temperature: 0.7, maxTokens: 2400 });
    return { text, savedFiles: savedCount, rejectedFiles: rejected.length ? rejected : undefined };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 3. Brief thiết kế cho Canva ─────────────────────────

export async function generateCanvaBrief(_prev: AiState, formData: FormData): Promise<AiState> {
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

    const { text } = await aiChat(canvaBriefPrompt(input), { temperature: 0.6, maxTokens: 2600 });
    return { text, savedFiles: savedCount, rejectedFiles: rejected.length ? rejected : undefined };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 4. Báo cáo BGĐ ─────────────────────────

export async function generateBoardReport(_prev: AiState, _formData: FormData): Promise<AiState> {
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const t = await getTranslations("ai.errors");
  // Báo cáo này gộp số liệu toàn công ty (margin, công nợ, tạm ứng) — chỉ đúng 3 người BGĐ (+ all-access).
  const vis = await getAiVisibility();
  if (!vis.canBoardReport) return { error: t("EXEC_ONLY") };

  try {
    const input = await buildBoardReportInput();
    const { text } = await aiChat(boardReportPrompt(input), { temperature: 0.25, maxTokens: 2400 });
    return { text };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 5. Xu hướng ngành ─────────────────────────

export async function askIndustryTrend(_prev: AiState, formData: FormData): Promise<AiState> {
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
      const { text } = await aiChat(industryTrendGroundedPrompt(question, sources), {
        temperature: 0.3, // thấp: nhiệm vụ là tổng hợp nguồn, không phải sáng tạo
        maxTokens: 2800,
      });
      return { text, grounded: true, sourceCount: sources.length };
    }

    const { text } = await aiChat(industryTrendPrompt(question), { temperature: 0.7, maxTokens: 2200 });
    return { text, grounded: false };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}
