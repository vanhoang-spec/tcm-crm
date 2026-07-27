import { z } from "zod";

/**
 * Lưới Operations lưu TỪNG DÒNG riêng (không replace-all cả batch) — mỗi dòng gửi 1 hidden input
 * JSON (`rowJson`) khi bấm "Lưu" trên chính dòng đó, để sửa/thêm 1 người KHÔNG làm mất
 * generatedFileKey/generatedAt của các dòng khác đã tạo biên bản trước đó. Import Excel vẫn
 * replace-all (đúng bản chất "nạp lại từ file mới") — xem operations/actions.ts.
 */
export const ctvRowSchema = z.object({
  sort: z.coerce.number().int().min(0).default(0),
  fullName: z.string().trim().min(1),
  gender: z.string().trim().optional().default(""),
  dateOfBirth: z.string().trim().optional().default(""),
  nationality: z.string().trim().optional().default(""),
  idNumber: z.string().trim().optional().default(""),
  idIssueDate: z.string().trim().optional().default(""),
  idIssuePlace: z.string().trim().optional().default(""),
  permanentAddress: z.string().trim().optional().default(""),
  taxCode: z.string().trim().optional().default(""),
  bankAccountNo: z.string().trim().optional().default(""),
  bankName: z.string().trim().optional().default(""),
  bankBranch: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
  eventName: z.string().trim().optional().default(""),
  executionDate: z.string().trim().optional().default(""),
  acceptanceDate: z.string().trim().optional().default(""),
  executionLocation: z.string().trim().optional().default(""),
  workItem: z.string().trim().optional().default(""),
  unit: z.string().trim().optional().default(""),
  quantity: z.coerce.number().min(0).nullable().optional(),
  unitPrice: z.coerce.number().min(0).nullable().optional(),
  amount: z.coerce.number().min(0).nullable().optional(),
  grossNet: z.string().trim().optional().default(""),
  pitTax: z.coerce.number().min(0).nullable().optional(),
  netReceived: z.coerce.number().min(0).nullable().optional(),
  note: z.string().trim().optional().default(""),
  /** Dòng CO/CE của khoản chi này — server kiểm dòng thuộc đúng dự án trước khi ghi. Trống = kế
   *  thừa dòng mặc định của đợt (CtvBatch.defaultFinanceCostLineId). */
  financeCostLineId: z.string().trim().optional().default(""),
});

export type CtvRowPayload = z.infer<typeof ctvRowSchema>;
