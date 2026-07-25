import "server-only";
import { prisma } from "@/lib/prisma";
import { AI_FILE_MIME_TYPES, MAX_AI_FILE_BYTES, saveAiFile } from "@/lib/ai-file-storage";

/**
 * Lưu các file người dùng đính kèm (input name="files", multiple) vào thư viện `ProjectFile` của
 * dự án đang chọn — 1 lần upload dùng lại mãi cho các lần chạy AI sau trên cùng dự án. Bỏ qua
 * (không throw) file rỗng/quá lớn/sai định dạng — trả về danh sách lỗi để UI có thể hiện nếu cần,
 * nhưng KHÔNG chặn phần còn lại của request (người dùng vẫn muốn chạy AI dù 1 file bị từ chối).
 */
export async function saveProjectFilesFromFormData(
  projectId: string,
  formData: FormData,
  staffId: string | null,
): Promise<{ savedCount: number; rejected: string[] }> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  let savedCount = 0;
  const rejected: string[] = [];

  for (const file of files) {
    if (file.size > MAX_AI_FILE_BYTES) {
      rejected.push(file.name);
      continue;
    }
    if (!AI_FILE_MIME_TYPES.includes(file.type)) {
      rejected.push(file.name);
      continue;
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileKey = await saveAiFile(buffer, file.type);
      await prisma.projectFile.create({
        data: {
          projectId,
          fileKey,
          fileMime: file.type,
          fileName: file.name || "file",
          fileSize: file.size,
          uploadedById: staffId,
        },
      });
      savedCount++;
    } catch (e) {
      console.error("[AI] lỗi lưu file đính kèm dự án:", e);
      rejected.push(file.name);
    }
  }

  return { savedCount, rejected };
}
