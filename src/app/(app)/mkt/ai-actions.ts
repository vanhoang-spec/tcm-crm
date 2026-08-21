"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { AiError } from "@/lib/ai/deepseek";
import { isMktAiConfigured, mktChat } from "@/lib/ai/mkt-ai";
import { extractTextFromFile } from "@/lib/ai/extract-text";
import { mktInsightsPrompt } from "@/lib/ai/mkt-prompts";
import { readMktFile } from "@/lib/mkt-storage";
import { aiDesignBrief, aiDraftVariant } from "@/lib/mkt-ai-server";
import { buildQuarterStats, isMktChannel, quarterRange, type MktChannel } from "@/lib/mkt";
import type { MktState } from "./actions";

/**
 * Hai đường GỌI AI của module MKT post: viết bài từng kênh, và phân tích insights quý.
 *
 * Tách khỏi `actions.ts` vì khác về rủi ro và về quyền — mỗi lượt bấm là một lượt tính tiền
 * DeepSeek, nên có mã riêng `mkt.generate` (quyết định chủ dự án 04/08/2026: chỉ HR + BGĐ).
 *
 * ⚠ BẤT BIẾN: KHÔNG BAO GIỜ bọc `$transaction` quanh call AI. DB là SQLite single-writer còn một
 * lượt gọi có thể mất tới 75s — giữ writer suốt thời gian đó là treo cả app. Thứ tự đúng ở cả hai
 * action: đọc dữ liệu → gọi AI (ngoài transaction) → Zod → ghi NGẮN.
 */

/** Dịch AiError sang câu đã i18n; chi tiết kỹ thuật chỉ ghi log server. */
async function toMessage(e: unknown): Promise<string> {
  const t = await getTranslations("ai.errors");
  if (e instanceof AiError) {
    if (e.detail) console.error(`[MKT-AI] ${e.code}:`, e.detail);
    return t(e.code);
  }
  console.error("[MKT-AI] lỗi không xác định:", e);
  return t("UNKNOWN");
}

async function guard(): Promise<string | null> {
  const t = await getTranslations("ai.errors");
  const staffId = await getCurrentStaffId();
  if (!staffId) return t("NOT_LOGGED_IN");
  if (!isMktAiConfigured()) return t("NOT_CONFIGURED");
  return null;
}

async function audit(entityId: string, reason: string) {
  await prisma.auditLog.create({
    data: { entityType: "mkt", entityId, field: "*", action: "UPDATE", changedBy: await getCurrentStaffId(), reason },
  });
}

/**
 * AI viết bản nháp cho MỘT kênh.
 *
 * Gác hai lớp theo đúng mẫu `clients.kb.generate` / `finance.vendor_payment.over_cap`: cửa vào là
 * `mkt.view` (ai đọc được module), rồi `mkt.generate` kiểm BÊN TRONG như một ĐẶC QUYỀN THÊM. Không
 * dùng `mkt.review` làm cửa vào vì hai mã này có thể được BGĐ tách ra cho hai nhóm khác nhau về sau.
 */
export async function generateVariant(
  postId: string,
  channel: MktChannel,
  _prev: MktState,
  _formData: FormData,
): Promise<MktState> {
  await requirePermission("mkt.view");
  if (!(await hasPermission("mkt.generate"))) return { error: "NO_GENERATE_PERM" };
  if (!isMktChannel(channel)) return { error: "NOT_FOUND" };
  const blocked = await guard();
  if (blocked) return { aiError: blocked };

  // Lõi AI ở lib/mkt-ai-server.ts — chung với job tự dựng bài từ master plan (MKT-2a). Action chỉ còn
  // gác quyền, dịch lỗi, audit, revalidate.
  let step;
  try {
    step = await aiDraftVariant(postId, channel);
  } catch (e) {
    return { aiError: await toMessage(e) };
  }
  if (!step.ok) return { error: step.code };

  await audit(postId, `AI draft ${channel}`);
  revalidatePath(`/mkt/${postId}`);
  return { success: true };
}

/**
 * AI soạn BRIEF cho designer (MKT-2a) — cùng cửa gác hai lớp như viết bài. Ghi đè brief cũ (HR đã
 * được hỏi xác nhận ở client).
 */
export async function generateDesignBrief(postId: string, _prev: MktState, _formData: FormData): Promise<MktState> {
  await requirePermission("mkt.view");
  if (!(await hasPermission("mkt.generate"))) return { error: "NO_GENERATE_PERM" };
  const blocked = await guard();
  if (blocked) return { aiError: blocked };
  let step;
  try {
    step = await aiDesignBrief(postId);
  } catch (e) {
    return { aiError: await toMessage(e) };
  }
  if (!step.ok) return { error: step.code };
  await audit(postId, "AI design brief");
  revalidatePath(`/mkt/${postId}`);
  return { success: true };
}

/**
 * AI phân tích insights một quý.
 *
 * Nhịp đăng lấy từ CHÍNH DB của app (`buildQuarterStats`) chứ không đọc từ file export — file của
 * Meta/LinkedIn không biết TCM cam kết mấy bài một tuần. File chỉ đóng góp phần số liệu hiệu quả.
 */
export async function generateInsights(reportId: string, _prev: MktState, _formData: FormData): Promise<MktState> {
  await requirePermission("mkt.review");
  if (!(await hasPermission("mkt.generate"))) return { error: "NO_GENERATE_PERM" };
  const blocked = await guard();
  if (blocked) return { aiError: blocked };

  const report = await prisma.mktInsightReport.findUnique({
    where: { id: reportId },
    select: { id: true, year: true, quarter: true, note: true, files: { select: { fileKey: true, fileMime: true, fileName: true, channel: true } } },
  });
  if (!report) return { error: "NOT_FOUND" };

  const { start, end } = quarterRange(report.year, report.quarter);
  const posted = await prisma.mktPostVariant.findMany({
    where: { status: "POSTED", postedAt: { gte: start, lt: end } },
    select: { channel: true, postedAt: true },
  });
  const stats = buildQuarterStats(
    posted.flatMap((p) => (p.postedAt ? [{ channel: p.channel, postedAt: p.postedAt }] : [])),
    report.year,
    report.quarter,
  );

  // MKT-2c — số liệu app TỰ KÉO: ảnh chụp MỚI NHẤT của mỗi bài đã đăng trong quý. Đây là nguồn
  // chuẩn, khác hẳn file export HR tải lên (có thể cũ / khác kỳ / thiếu bài).
  const metricRows = await prisma.mktPostVariant.findMany({
    where: { status: "POSTED", postedAt: { gte: start, lt: end }, metrics: { some: {} } },
    select: {
      channel: true,
      postedAt: true,
      post: { select: { title: true } },
      metrics: { orderBy: { day: "desc" }, take: 1, select: { impressions: true, reactions: true, comments: true, shares: true, clicks: true } },
    },
  });
  const autoMetrics = metricRows.map((v) => ({
    channel: v.channel,
    title: v.post.title,
    postedAt: v.postedAt ? v.postedAt.toISOString().slice(0, 10) : "—",
    ...v.metrics[0],
  }));

  // File không đọc được VẪN in header tên file: model cần biết có tài liệu mà không đọc được, thay
  // vì tưởng HR chưa nộp gì (khuôn buildProjectFilesText).
  const fileBlocks: string[] = [];
  for (const f of report.files) {
    let body = "(không đọc được nội dung định dạng này — chỉ có tên file)";
    try {
      const buffer = await readMktFile(f.fileKey);
      const extracted = await extractTextFromFile(buffer, f.fileMime);
      if (extracted) body = extracted.text + (extracted.truncated ? "\n…(đã cắt bớt, file dài hơn)" : "");
    } catch {
      body = "(lỗi khi đọc file)";
    }
    fileBlocks.push(`--- ${f.fileName} (${f.channel}) ---\n${body}`);
  }

  let text: string;
  try {
    const result = await mktChat(
      mktInsightsPrompt({ year: report.year, quarter: report.quarter, stats, note: report.note, fileBlocks, autoMetrics }),
      { temperature: 0.2, maxTokens: 2400 },
    );
    text = result.text;
  } catch (e) {
    return { aiError: await toMessage(e) };
  }

  await prisma.mktInsightReport.update({ where: { id: reportId }, data: { aiResult: text, aiRanAt: new Date() } });
  await audit(reportId, `AI insights Q${report.quarter}/${report.year}`);
  revalidatePath("/mkt/insights");
  return { success: true };
}
