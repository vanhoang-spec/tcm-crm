import { z } from "zod";
import { LINE_TYPES, TAX_TYPES, MAX_SECTION_DEPTH } from "@/lib/bidding";

/**
 * CO/CE builder gửi toàn bộ section+line qua 1 hidden input JSON (`sectionsJson`) thay vì
 * flat `line_x_${i}` — payload lồng 2 cấp (section → line) không diễn tả gọn bằng FormData phẳng.
 */
export const costLineSchema = z.object({
  sectionKey: z.string().min(1),
  /**
   * Định danh BỀN của dòng — builder sinh 1 lần rồi gửi lại y nguyên ở mọi lần lưu.
   * Module ④ khoá tạm ứng/thanh toán vào đây. Optional để tương thích payload cũ; server tự
   * sinh khi thiếu (xem saveCostSheet).
   */
  stableKey: z.string().trim().optional().default(""),
  lineType: z.enum(LINE_TYPES).default("QTY_PRICE"),
  itemName: z.string().trim().min(1),
  specs: z.string().trim().optional().default(""),
  quantity: z.coerce.number().min(0).default(1),
  unit: z.string().trim().optional().default(""),
  // unitPrice/fixedAmount CHO PHÉP âm — dòng giảm tiền/khoản trừ (vd chiết khấu, thu hồi thanh lý)
  // biểu diễn bằng đơn giá/số tiền cố định âm, cộng thẳng vào tổng CO như mọi dòng khác.
  unitPrice: z.coerce.number().default(0),
  fixedAmount: z.coerce.number().nullable().optional(),
  percentVal: z.coerce.number().min(0).max(1000).nullable().optional(),
  taxType: z.enum(TAX_TYPES).default("VAT"),
  // Chỉ dùng khi taxType=OTHER — số tiền thuế nhập tay, cộng thẳng vào base (không gross-up %).
  customTaxAmount: z.coerce.number().nullable().optional(),
  vendorId: z.string().trim().optional().default(""),
  isLocked: z.boolean().default(false),
  maxMarkupPct: z.coerce.number().min(0).max(1000).nullable().optional(),
  /** Cờ "TCM hỗ trợ" — báo giá hiện đơn giá nhưng không tính tiền dòng này (CE dòng = 0). */
  isSponsored: z.boolean().default(false),
  /**
   * K3 — id dòng đề xuất GIỮ CHỖ kho đã duyệt, đặt trên CẢ HAI dòng của cặp (hàng lấy từ kho +
   * hàng mua bù). Server kiểm lại quyền sở hữu/số lượng trước khi lưu (không tin client).
   */
  stockResvLineId: z.string().trim().nullable().optional().default(null),
  /** K3 — đơn giá tham chiếu của dòng lấy từ kho; khác null = dòng kho (unitPrice bị ép về 0). */
  stockRefUnitPrice: z.coerce.number().nullable().optional().default(null),
  /**
   * LOF-V1 — nhãn CHẶNG (tỉnh/điểm/đợt) để gom khi xuất bản nghiệm thu. Thuần nhãn, người dùng tự
   * gõ, không có danh mục. Trần 40 ký tự: nhãn dài hơn thế là đang bị dùng nhầm làm ghi chú, mà
   * ghi chú đã có ô riêng — và nhãn còn phải vừa tiêu đề cột trên bản xuất Excel.
   */
  legCode: z.string().trim().max(40).optional().default(""),
  note: z.string().trim().optional().default(""),
});

export const costSectionSchema = z.object({
  key: z.string().min(1),
  // N-cấp (Mục→Nhóm→Sub-nhóm→...) — chỉ áp dụng nhánh THƯỜNG; mục Chi hộ (isProxy) luôn ở gốc,
  // chốt bằng superRefine bên dưới (không tin client, có thể gửi sai).
  parentKey: z.string().min(1).nullable().optional().default(null),
  code: z.string().trim().min(1),
  icon: z.string().trim().optional().default(""),
  nameVi: z.string().trim().min(1),
  nameEn: z.string().trim().optional().default(""),
  colorSlot: z.string().trim().optional().default("neutral"),
  isProxy: z.boolean().default(false),
  /** Phòng ban phụ trách — quyết định prefix mã của mọi dòng trong hạng mục. */
  departmentCode: z.string().trim().optional().default(""),
  proxyFeeType: z.enum(["PCT", "FIXED"]).nullable().optional(),
  proxyFeeVal: z.coerce.number().min(0).nullable().optional(),
});

export const costSheetPayloadSchema = z
  .object({
    sections: z.array(costSectionSchema).min(1),
    lines: z.array(costLineSchema),
  })
  .superRefine((payload, ctx) => {
    const byKey = new Map(payload.sections.map((s) => [s.key, s]));

    // Chi hộ chỉ nhận QTY_PRICE/FIXED. Dòng PERCENT_OF_TOTAL nằm trong Chi hộ sẽ KHÔNG được
    // cộng vào đâu cả — computeCostSheetTotals loại nó khỏi proxySubtotal, còn directCo/
    // percentLinesTotal chỉ quét hạng mục thường → tiền biến mất im lặng trong khi dòng vẫn có
    // amount và vẫn hiện trên bảng. UI đã ẩn lựa chọn này trong khối Chi hộ (hidePercent ở
    // cost-sheet-builder), nhưng đó là chặn phía client; chốt lại ở đây theo đúng quy ước
    // "không tin số từ client" (HANDOVER mục 4.1).
    for (const l of payload.lines) {
      if (l.lineType !== "PERCENT_OF_TOTAL") continue;
      if (byKey.get(l.sectionKey)?.isProxy) {
        ctx.addIssue({
          code: "custom",
          path: ["lines"],
          message: `Dòng "${l.itemName}" thuộc hạng mục Chi hộ nên không được dùng loại % trên tổng.`,
        });
      }
    }

    for (const s of payload.sections) {
      // Chi hộ luôn ở gốc — không lồng dưới section khác.
      if (s.isProxy && s.parentKey) {
        ctx.addIssue({ code: "custom", path: ["sections"], message: `Section "${s.key}" (Chi hộ) không được lồng dưới section khác.` });
        continue;
      }
      if (s.parentKey && !byKey.has(s.parentKey)) {
        ctx.addIssue({ code: "custom", path: ["sections"], message: `Section "${s.key}" có parentKey không tồn tại.` });
        continue;
      }
      // Đi ngược lên tổ tiên: đếm cấp (bản thân = 1) + phát hiện vòng lặp bằng tập "đã đi qua".
      let depth = 1;
      const visited = new Set<string>([s.key]);
      let parentKey = s.parentKey;
      while (parentKey) {
        if (visited.has(parentKey)) {
          ctx.addIssue({ code: "custom", path: ["sections"], message: `Section "${s.key}" tạo thành vòng lặp cha-con.` });
          break;
        }
        visited.add(parentKey);
        depth++;
        if (depth > MAX_SECTION_DEPTH) {
          ctx.addIssue({ code: "custom", path: ["sections"], message: `Section "${s.key}" vượt quá ${MAX_SECTION_DEPTH} cấp.` });
          break;
        }
        parentKey = byKey.get(parentKey)?.parentKey ?? null;
      }
    }
  });

export type CostSheetPayload = z.infer<typeof costSheetPayloadSchema>;
