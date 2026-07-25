import { z } from "zod";

/**
 * Tài liệu Cơ sở tri thức: đúng 1 trong 2 nguồn — file upload HOẶC link ngoài.
 * Validate "đúng 1 trong 2" ở server action (actions.ts) sau khi đọc FormData, vì file/link
 * không cùng đi qua zod (File không phải kiểu JSON-serializable như các payload khác trong app).
 */
export const kbDocumentSchema = z.object({
  categoryId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().optional().default(""),
  linkUrl: z.union([z.string().trim().url(), z.literal("")]).default(""),
});

export type KbDocumentPayload = z.infer<typeof kbDocumentSchema>;
