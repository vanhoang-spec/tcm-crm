"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { MAX_BATCH_SCORE, runBatchCvScoring } from "@/lib/recruit-score-server";

/**
 * TD-2a — CỔNG SÀNG LỌC: chấm CV bằng AI (hàng loạt) và quyết định phỏng vấn / loại.
 *
 * ⚠ `export type` trong file "use server" làm VỠ RUNTIME (HANDOVER 10.23) — chỉ `export type Foo =`
 * dạng khai báo mới an toàn, đừng dùng `export type { X }`.
 */

export type ScreenState = { error?: string; queued?: number; success?: boolean };

/**
 * Xếp hàng các hồ sơ được tick rồi CHẤM NỀN.
 *
 * ⚠ FIRE-AND-FORGET, cố ý không await: một lượt AI tới 75s, 20 hồ sơ là ~10 phút — await trong
 * server action là trang treo và Cloudflare cắt ở ~100s (mirror MKT-2a). Đổi lại phải có cột
 * `Candidate.aiReviewStatus` để màn hình biết đang chạy tới đâu.
 * ⚠ Tiến trình restart giữa chừng thì hồ sơ nằm lại ở QUEUED/RUNNING — HR bấm lại là xong, không
 * mất gì (mỗi lượt chấm là một dòng review mới, không ghi đè).
 */
export async function startCvScoring(_prev: ScreenState, formData: FormData): Promise<ScreenState> {
  await requirePermission("recruit.manage");
  // AI tính tiền theo LƯỢT ⇒ đặc quyền THÊM chồng lên quyền quản lý hồ sơ, không thay thế nó
  // (mirror mkt.generate / clients.kb.generate).
  if (!(await hasPermission("recruit.ai_parse"))) return { error: "NO_AI_PERM" };
  if (!isAiConfigured()) return { error: "AI_NOT_CONFIGURED" };

  const ids = formData.getAll("candidateId").map(String).filter(Boolean);
  if (ids.length === 0) return { error: "NO_SELECTION" };
  if (ids.length > MAX_BATCH_SCORE) return { error: "TOO_MANY" };

  // Đọc lại từ DB, KHÔNG tin danh sách id từ client: chỉ hồ sơ đang chạy và chưa có lượt chấm nào
  // đang chạy mới được xếp hàng.
  // ⚠ PHẢI viết OR[null, not RUNNING], KHÔNG được viết gọn `{ not: "RUNNING" }`: trong SQL
  // `NULL != 'RUNNING'` cho ra NULL chứ không phải TRUE, nên bộ lọc gọn LOẠI SẠCH mọi hồ sơ chưa
  // từng chấm — tức đúng những hồ sơ cần chấm nhất. Đã đo trên dev.db: câu gọn ra 0/4 dòng, câu này
  // ra 4/4. Lỗi im lặng, người dùng chỉ thấy "chưa chọn hồ sơ nào hợp lệ".
  const rows = await prisma.candidate.findMany({
    where: {
      id: { in: ids },
      status: { in: ["NEW", "INTERVIEWING"] },
      OR: [{ aiReviewStatus: null }, { aiReviewStatus: { not: "RUNNING" } }],
    },
    select: { id: true },
  });
  if (rows.length === 0) return { error: "NO_SELECTION" };

  const staffId = await getCurrentStaffId();
  const queueIds = rows.map((r) => r.id);
  await prisma.candidate.updateMany({ where: { id: { in: queueIds } }, data: { aiReviewStatus: "QUEUED", aiReviewError: null } });

  // Thả chạy nền. Lỗi bên trong đã được ghi lên từng hồ sơ; bắt ở đây chỉ để một lượt hỏng không
  // thành unhandled rejection làm ồn log.
  void runBatchCvScoring(queueIds, staffId).catch((e) => console.error("[RECRUIT-AI] batch:", e));

  revalidatePath("/staff/recruit");
  return { queued: queueIds.length, success: true };
}

/**
 * Quyết định ở cổng sàng lọc: cho phỏng vấn hay loại.
 *
 * ⚠ Gác bằng `recruit.interview.manage` — người quyết có phỏng vấn hay không CHÍNH là người sẽ đặt
 * lịch. Không dùng `recruit.decide` (đó là quyết định CUỐI: nhận hay không nhận).
 * ⚠ Quyết định "loại" ở đây KHÔNG tự gửi thư từ chối. Thư đi ở bước riêng, có bản xem trước —
 * quyết định chủ dự án 22/08/2026: thư đã ra khỏi hệ thống thì không thu hồi được.
 */
export async function setScreenDecision(_prev: ScreenState, formData: FormData): Promise<ScreenState> {
  await requirePermission("recruit.interview.manage");
  const id = String(formData.get("candidateId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (!id || (decision !== "INTERVIEW" && decision !== "REJECT")) return { error: "BAD_INPUT" };

  const candidate = await prisma.candidate.findUnique({ where: { id }, select: { status: true } });
  if (!candidate) return { error: "NOT_FOUND" };
  // Hồ sơ đã chốt (nhận / đã từ chối) thì cổng sàng lọc không còn nghĩa gì.
  if (candidate.status === "HIRED" || candidate.status === "REJECTED") return { error: "ALREADY_CLOSED" };

  const staffId = await getCurrentStaffId();
  await prisma.candidate.update({
    where: { id },
    data: { screenDecision: decision, screenDecidedAt: new Date(), screenDecidedById: staffId },
  });
  await prisma.auditLog.create({
    data: {
      entityType: "candidate",
      entityId: id,
      field: "screenDecision",
      action: decision === "INTERVIEW" ? "SCREEN_PASS" : "SCREEN_REJECT",
      newValue: JSON.stringify({ decision, note: note || null }),
      changedBy: staffId,
    },
  });

  revalidatePath("/staff/recruit");
  revalidatePath(`/staff/recruit/candidates/${id}`);
  return { success: true };
}
