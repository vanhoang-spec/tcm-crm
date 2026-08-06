"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { REQUEST_ITEM_CODES, spawnTasksForCreativeRequest } from "@/lib/creative";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function textOrNull(v: FormDataEntryValue | null, max = 2000): string | null {
  const s = str(v);
  return s ? s.slice(0, max) : null;
}

export type RequestFormState = { error?: string };

/**
 * Sinh mã 3 ký tự cho khách mới — mã là bắt buộc và duy nhất trong `Client`.
 *
 * Bỏ dấu tiếng Việt trước khi lấy chữ cái, nếu không "Đại Đồng" ra mã rỗng. Trùng thì thêm số.
 * THUẦN trừ lần truy vấn kiểm trùng.
 */
async function makeClientCode(name: string): Promise<string> {
  const ascii = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const base = (ascii.slice(0, 3) || "KH0").padEnd(3, "0");
  for (let i = 0; i < 100; i++) {
    const code = i === 0 ? base : `${base.slice(0, 2)}${i}`;
    if (!(await prisma.client.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("KHONG_SINH_DUOC_MA_KHACH");
}

/** Mã công việc kế tiếp: JOB001, JOB002… Đếm theo số bản ghi nên không phụ thuộc thứ tự xoá. */
async function makeProjectCode(): Promise<string> {
  for (let n = (await prisma.project.count()) + 1; n < 100000; n++) {
    const code = `JOB${String(n).padStart(3, "0")}`;
    if (!(await prisma.project.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("KHONG_SINH_DUOC_MA_CONG_VIEC");
}

/**
 * Gửi một YÊU CẦU CREATIVE → sinh task cho từng hạng mục được tick.
 *
 * Form cho phép chọn công việc có sẵn HOẶC tạo mới ngay tại chỗ (kèm khách mới nếu cần) — bản mini
 * không có màn quản lý khách/dự án riêng, nên nếu bắt phải tạo trước ở chỗ khác thì người đặt việc
 * sẽ kẹt ngay ở bước đầu tiên.
 *
 * ⚠ HẠN BẮT BUỘC. Đây là chốt chặn tận gốc của lỗi "task không có hạn" ở bản TCM: cột
 * `CreativeRequest.deadline` là NOT NULL và được chép xuống từng task, nên không có đường nào sinh
 * ra task thiếu hạn — kể cả khi người dùng gỡ `required` phía trình duyệt.
 */
export async function createCreativeRequest(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("creative.request.create");
  const meId = await getCurrentStaffId();

  // ── Hạng mục ──
  const items = REQUEST_ITEM_CODES.filter((code) => formData.get(`item_${code}`) === "on").map((code) => ({
    label: code,
    detail: textOrNull(formData.get(`detail_${code}`), 500),
  }));
  if (items.length === 0) return { error: "NO_ITEM" };

  // ── Hạn ──
  const deadlineStr = str(formData.get("deadline"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadlineStr)) return { error: "NO_DEADLINE" };
  // Quy ước UTC-midnight của app cho cột NGÀY nghiệp vụ (khác mốc thời gian thật như giờ họp).
  const deadline = new Date(deadlineStr);
  if (Number.isNaN(deadline.getTime())) return { error: "NO_DEADLINE" };

  // ── Công việc: chọn sẵn hoặc tạo mới ──
  let projectId = str(formData.get("projectId"));
  if (!projectId) {
    const projectName = str(formData.get("newProjectName")).slice(0, 160);
    if (!projectName) return { error: "NO_PROJECT" };

    let clientId = str(formData.get("clientId"));
    if (!clientId) {
      const clientName = str(formData.get("newClientName")).slice(0, 160);
      if (!clientName) return { error: "NO_CLIENT" };
      const status = await prisma.optionItem.findFirst({
        where: { set: { code: "client_status" }, code: "ACTIVE" },
        select: { id: true },
      });
      if (!status) return { error: "NO_CLIENT_STATUS" };
      const created = await prisma.client.create({
        data: { code: await makeClientCode(clientName), name: clientName, statusId: status.id },
        select: { id: true },
      });
      clientId = created.id;
    }

    const [status, complexity] = await Promise.all([
      prisma.optionItem.findFirst({ where: { set: { code: "project_status" }, code: "PROCESSING" }, select: { id: true } }),
      prisma.optionItem.findFirst({ where: { set: { code: "complexity" }, code: "MEDIUM" }, select: { id: true } }),
    ]);
    if (!status || !complexity) return { error: "NO_OPTION_SET" };

    const project = await prisma.project.create({
      data: {
        code: await makeProjectCode(),
        name: projectName,
        clientId,
        statusId: status.id,
        complexityId: complexity.id,
        fiscalYear: new Date().getFullYear(),
        ownerId: meId,
      },
      select: { id: true },
    });
    projectId = project.id;
  } else if (!(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) {
    return { error: "NO_PROJECT" };
  }

  const request = await prisma.creativeRequest.create({
    data: {
      projectId,
      requestedById: meId,
      briefLinkUrl: textOrNull(formData.get("briefLinkUrl"), 500),
      note: textOrNull(formData.get("note")),
      deadline,
    },
    select: { id: true },
  });

  // Sinh task NGOÀI transaction: hàm này còn gửi notification, mà SQLite chỉ có một người ghi —
  // giữ writer trong lúc bắn thông báo là chặn cả app.
  await spawnTasksForCreativeRequest(request.id, items);

  await prisma.auditLog.create({
    data: { entityType: "creative_request", entityId: request.id, field: "*", action: "create", changedBy: meId },
  });

  revalidatePath("/creative");
  revalidatePath("/creative/requests");
  // Điều hướng ở SERVER — gọi router trong lúc render là cập nhật component khác giữa chừng,
  // React cảnh báo và hành vi không bảo đảm ở chế độ đồng thời.
  redirect("/creative/requests");
}
