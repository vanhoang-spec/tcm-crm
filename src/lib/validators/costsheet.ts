import { z } from "zod";
import { LINE_TYPES } from "@/lib/bidding";

/**
 * CO/CE builder gửi toàn bộ section+line qua 1 hidden input JSON (`sectionsJson`) thay vì
 * flat `line_x_${i}` — payload lồng 2 cấp (section → line) không diễn tả gọn bằng FormData phẳng.
 */
export const costLineSchema = z.object({
  sectionKey: z.string().min(1),
  lineType: z.enum(LINE_TYPES).default("QTY_PRICE"),
  itemName: z.string().trim().min(1),
  specs: z.string().trim().optional().default(""),
  quantity: z.coerce.number().min(0).default(1),
  unit: z.string().trim().optional().default(""),
  unitPrice: z.coerce.number().min(0).default(0),
  fixedAmount: z.coerce.number().min(0).nullable().optional(),
  percentVal: z.coerce.number().min(0).max(1000).nullable().optional(),
  vendorId: z.string().trim().optional().default(""),
  isLocked: z.boolean().default(false),
  maxMarkupPct: z.coerce.number().min(0).max(1000).nullable().optional(),
  note: z.string().trim().optional().default(""),
});

export const costSectionSchema = z.object({
  key: z.string().min(1),
  code: z.string().trim().min(1),
  icon: z.string().trim().optional().default(""),
  nameVi: z.string().trim().min(1),
  nameEn: z.string().trim().optional().default(""),
  colorSlot: z.string().trim().optional().default("neutral"),
  isProxy: z.boolean().default(false),
  proxyFeeType: z.enum(["PCT", "FIXED"]).nullable().optional(),
  proxyFeeVal: z.coerce.number().min(0).nullable().optional(),
});

export const costSheetPayloadSchema = z.object({
  sections: z.array(costSectionSchema).min(1),
  lines: z.array(costLineSchema),
});

export type CostSheetPayload = z.infer<typeof costSheetPayloadSchema>;
