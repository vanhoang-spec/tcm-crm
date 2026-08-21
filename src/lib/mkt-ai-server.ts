import "server-only";
import { prisma } from "@/lib/prisma";
import { isMktAiConfigured, mktChatJson } from "@/lib/ai/mkt-ai";
import { mktDesignBriefPrompt, mktVariantPrompt } from "@/lib/ai/mkt-prompts";
import { mktAiContentSchema, mktDesignBriefSchema, type MktChannel } from "@/lib/mkt";

/**
 * LÕI GỌI AI của module MKT — MỘT đường cho cả nút bấm tay (ai-actions.ts) lẫn job tự dựng bài từ
 * master plan (mkt-plan-server.ts). Tách khỏi file "use server" vì job không có request context
 * (không getCurrentStaffId, không getTranslations) và vì mọi export của file action là endpoint.
 *
 * Hàm KHÔNG gác quyền — người gọi gác (action: mkt.view + mkt.generate; job: không có người, quyền
 * là việc HR đã lưu dòng kế hoạch). KHÔNG bọc $transaction quanh call AI (SQLite single-writer, AI
 * tới 75s). Lỗi AI ném ra ngoài dưới dạng AiError để caller tự dịch/ghi log.
 */

export type AiStepResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "LOCKED" | "AI_SHAPE" | "WRONG_STATE" };

/** AI viết bản nháp cho MỘT kênh rồi ghi đè aiDraft + finalContent (guard trạng thái chống đè bài đã đăng). */
export async function aiDraftVariant(postId: string, channel: MktChannel): Promise<AiStepResult> {
  const post = await prisma.mktPost.findUnique({
    where: { id: postId },
    select: {
      title: true,
      keyPoints: true,
      contentType: { select: { labelVi: true } },
      project: { select: { code: true, name: true, client: { select: { name: true } } } },
      _count: { select: { images: true } },
      variants: { where: { channel }, select: { id: true, status: true } },
    },
  });
  const variant = post?.variants[0];
  if (!post || !variant) return { ok: false, code: "NOT_FOUND" };
  if (variant.status === "POSTED") return { ok: false, code: "LOCKED" };

  const raw = await mktChatJson<unknown>(
    mktVariantPrompt(channel, {
      title: post.title,
      keyPoints: post.keyPoints,
      contentTypeLabel: post.contentType?.labelVi ?? null,
      projectCode: post.project?.code ?? null,
      projectName: post.project?.name ?? null,
      clientName: post.project?.client?.name ?? null,
      imageCount: post._count.images,
    }),
    // Fanpage nóng hơn để có giọng trẻ; LinkedIn giữ thấp cho ổn định văn phong công ty.
    { temperature: channel === "FANPAGE" ? 0.7 : 0.5, maxTokens: 1600 },
  );
  const parsed = mktAiContentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "AI_SHAPE" };

  // Guard trạng thái: giữa lúc gọi AI (tới 75s) có thể đã có người đánh dấu ĐÃ ĐĂNG — ghi đè lúc đó
  // là sửa nội dung của bài đang nằm ngoài kia.
  const res = await prisma.mktPostVariant.updateMany({
    where: { id: variant.id, status: { in: ["DRAFT", "AI_DRAFTED"] } },
    data: { aiDraft: parsed.data.content, finalContent: parsed.data.content, status: "AI_DRAFTED", aiDraftedAt: new Date() },
  });
  return res.count === 0 ? { ok: false, code: "WRONG_STATE" } : { ok: true };
}

/** AI soạn brief cho designer từ ý chính + nội dung đã có của các kênh, ghi vào MktPost.designBrief. */
export async function aiDesignBrief(postId: string): Promise<AiStepResult & { brief?: string }> {
  const post = await prisma.mktPost.findUnique({
    where: { id: postId },
    select: {
      title: true,
      keyPoints: true,
      contentType: { select: { labelVi: true } },
      _count: { select: { images: true } },
      variants: { select: { channel: true, finalContent: true } },
    },
  });
  if (!post) return { ok: false, code: "NOT_FOUND" };

  const raw = await mktChatJson<unknown>(
    mktDesignBriefPrompt({
      title: post.title,
      keyPoints: post.keyPoints,
      channels: post.variants.map((v) => v.channel),
      contents: post.variants.map((v) => ({ channel: v.channel, content: v.finalContent })),
      imageCount: post._count.images,
      contentTypeLabel: post.contentType?.labelVi ?? null,
    }),
    { temperature: 0.5, maxTokens: 900 },
  );
  const parsed = mktDesignBriefSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "AI_SHAPE" };

  await prisma.mktPost.update({ where: { id: postId }, data: { designBrief: parsed.data.brief } });
  return { ok: true, brief: parsed.data.brief };
}

export { isMktAiConfigured };
