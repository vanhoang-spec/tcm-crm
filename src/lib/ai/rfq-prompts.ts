/**
 * PUR-1 — Prompt + khuôn dữ liệu cho AI ĐỌC FILE BÁO GIÁ NCC rồi điền vào form RFQ theo mẫu.
 *
 * ⚠ `aiChatJson` chỉ ép kiểu `as T`, KHÔNG validate (HANDOVER 10.14) — mọi trường đi qua Zod. Model
 * hay trả đơn giá dạng "1.500.000đ" / "1,5tr", nhét thành tiền vào ô đơn giá, hoặc bịa dòng — cắt hết.
 *
 * ⚠ AI CHỈ TRẢ VỀ CHO FORM, KHÔNG ghi thẳng DB (mirror `parseCvWithAi`): PUR nhìn, sửa, rồi bấm Lưu.
 * Server tính lại thành tiền bằng `computeQuoteLineAmount` — số amount AI trả chỉ để đối chiếu.
 *
 * ⚠ DỮ LIỆU GỬI RA NGOÀI: nội dung file báo giá đi NGUYÊN VĂN sang DeepSeek — dữ liệu thương mại
 * của bên thứ ba (đơn giá, điều khoản, đôi khi tên/điện thoại người liên hệ). Hộp xác nhận trước nút
 * bấm nói rõ điều này (chuẩn đã áp cho CV và kho kiến thức khách).
 *
 * File này KHÔNG import prisma/server-only — chỉ dựng chuỗi và khai schema.
 */

import { z } from "zod";
import type { AiMessage } from "./deepseek";
import type { RfqTemplate } from "../rfq-templates";

/** Số tiền VND: nhận number hoặc chuỗi có dấu chấm/phẩy; ngoài dải [0, 100 tỷ] → null. */
const moneySchema = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v == null) return null;
    let n: number;
    if (typeof v === "number") n = v;
    else {
      const digits = v.replace(/[^\d]/g, "");
      if (!digits) return null;
      n = Number(digits);
    }
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000_000) return null;
    return Math.round(n);
  });

const qtySchema = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null;
  });

const capped = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => {
      const s = (v ?? "").trim();
      return s ? s.slice(0, max) : null;
    });

/** Giá trị cột mở rộng: số/chuỗi/bool — giữ nguyên kiểu thô, form sẽ ép theo `type` của cột. */
const extraValueSchema = z.union([z.number(), z.string(), z.boolean()]).nullish();

export const rfqParseSchema = z.object({
  lines: z
    .array(
      z.object({
        /** id dòng RFQ đã cho trong prompt — dòng lạ bị loại ở caller. */
        rfqLineId: z.string().min(1).max(64),
        unitPrice: moneySchema,
        quantity: qtySchema,
        amount: moneySchema,
        extra: z.record(z.string(), extraValueSchema).nullish(),
        note: capped(300),
        /** Tên dòng trong FILE mà model đã khớp — để PUR đối chiếu tay. */
        matchedName: capped(160),
      }),
    )
    .max(200)
    .default([]),
  /** Dòng trong file không khớp dòng RFQ nào — hiện panel "không khớp", KHÔNG tự thêm dòng. */
  unmatched: z
    .array(z.object({ name: capped(160), amount: moneySchema }))
    .max(100)
    .default([]),
  terms: z.record(z.string(), z.union([z.number(), z.string()]).nullish()).nullish(),
  /** Model tự đánh giá độ chắc chắn 0–1 — chỉ hiện cho PUR, không dùng để quyết định. */
  confidence: z.number().min(0).max(1).nullish(),
});

export type RfqParseResult = z.infer<typeof rfqParseSchema>;

const RULES = `QUY TẮC BẮT BUỘC:
1. CHỈ dùng số có trong FILE. Không suy diễn, không bịa. Dòng nào file không có giá thì unitPrice=null.
2. "unitPrice" là ĐƠN GIÁ (giá cho một đơn vị) — KHÔNG phải thành tiền. Nếu file chỉ có thành tiền, để unitPrice=null và ghi vào "amount".
3. Khớp từng dòng file với dòng RFQ theo NGHĨA (tên hàng/dịch vụ, mô tả, ĐVT), không theo thứ tự. Một dòng RFQ chỉ khớp tối đa một dòng file. Dòng file không khớp dòng RFQ nào → đưa vào "unmatched", KHÔNG tự thêm.
4. Số tiền là VND, trả dạng số nguyên (không dấu chấm/phẩy). "1.500.000" → 1500000.
5. Cột mở rộng ("extra") chỉ điền khi file có thông tin tương ứng (vd số show, số ngày, số người, giờ/người); không có thì bỏ trống.
6. "terms": chỉ điền điều khoản mà file nói rõ (VAT %, thanh toán, hiệu lực…). Không có thì bỏ trống.
7. Trả về JSON đúng khuôn, không thêm chữ ngoài JSON.`;

export function rfqParseMessages(opts: {
  template: RfqTemplate;
  rfqTitle: string;
  vendorName: string;
  lines: { id: string; itemName: string; specs: string | null; unit: string | null; quantity: number }[];
  fileText: string;
}): AiMessage[] {
  const cols = opts.template.lineColumns.map((c) => `- ${c.key} (${c.labelVi}, ${c.type})`).join("\n");
  const terms = opts.template.terms.map((t) => `- ${t.key} (${t.labelVi})`).join("\n");
  const lines = opts.lines.map((l) => `- id="${l.id}" | ${l.itemName}${l.specs ? ` — ${l.specs}` : ""} | ĐVT: ${l.unit ?? "?"} | SL hỏi: ${l.quantity}`).join("\n");

  const system = `Bạn là trợ lý bộ phận Thu mua của agency sự kiện TCM. Nhiệm vụ: đọc BẢNG BÁO GIÁ của nhà cung cấp (đã trích thành text) và điền vào form RFQ theo mẫu "${opts.template.labelVi}".

${RULES}

KHUÔN JSON TRẢ VỀ:
{
  "lines": [ { "rfqLineId": "<id dòng RFQ>", "unitPrice": <số|null>, "quantity": <số|null>, "amount": <số|null>, "extra": { <key cột>: <giá trị> }, "note": "<ghi chú dòng nếu có>", "matchedName": "<tên dòng trong file>" } ],
  "unmatched": [ { "name": "<tên dòng file không khớp>", "amount": <số|null> } ],
  "terms": { <key điều khoản>: <giá trị> },
  "confidence": <0..1>
}

CỘT MỞ RỘNG CỦA MẪU (key trong "extra"):
${cols || "- (không có)"}

ĐIỀU KHOẢN CHUNG CỦA MẪU (key trong "terms"):
${terms || "- (không có)"}`;

  const user = `RFQ: ${opts.rfqTitle}
Nhà cung cấp: ${opts.vendorName}

DÒNG RFQ CẦN ĐIỀN GIÁ (khớp theo nghĩa):
${lines}

NỘI DUNG FILE BÁO GIÁ (text trích từ Excel/PDF, có thể lộn xộn):
"""
${opts.fileText}
"""`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ─────────────────────────────────────────────────────────
// PUR-1b — AI SO SÁNH báo giá. ⚠ Số liệu (rẻ nhất, chênh %, vượt CO, tổng) đã tính bằng CODE ở
// lib/rfq-compare.ts và đưa vào prompt; AI CHỈ viết nhận xét + gợi ý có lý do. Số AI trả về
// (nếu có) không bao giờ được dùng làm số so sánh — chốt chặn "không để AI làm toán".
// ─────────────────────────────────────────────────────────

export const rfqCompareSchema = z.object({
  /** Nhận xét tổng quan ≤ 600 ký tự. */
  summary: capped(600),
  /** Gợi ý từng dòng: NCC nên chọn + lý do ≤ 2 câu. rfqVendorId phải nằm trong danh sách đã cho. */
  lineSuggestions: z
    .array(
      z.object({
        rfqLineId: z.string().min(1).max(64),
        rfqVendorId: z.string().min(1).max(64).nullish(),
        reason: capped(240),
      }),
    )
    .max(200)
    .default([]),
  /** Điểm khác biệt điều khoản đáng chú ý (thanh toán, VAT, vận chuyển…). */
  termsNotes: z.array(capped(200)).max(20).default([]),
  /** Rủi ro / thứ PUR nên hỏi lại NCC. */
  risks: z.array(capped(200)).max(20).default([]),
});
export type RfqCompareResult = z.infer<typeof rfqCompareSchema>;

export function rfqCompareMessages(opts: {
  rfqTitle: string;
  templateLabel: string;
  matrixText: string;
}): AiMessage[] {
  const system = `Bạn là trợ lý bộ phận Thu mua của agency sự kiện TCM. Bạn nhận MA TRẬN SO SÁNH báo giá đã được hệ thống TÍNH SẴN (rẻ nhất, chênh %, thiếu dòng, vượt giá CO tham chiếu, tổng theo NCC, điều khoản). Nhiệm vụ: viết nhận xét ngắn và gợi ý chọn NCC cho TỪNG DÒNG kèm lý do.

QUY TẮC:
1. KHÔNG tính lại số. Chỉ dùng số đã cho. Không bịa NCC hay dòng không có trong dữ liệu.
2. Gợi ý theo TỔNG THỂ, không chỉ giá: coverage (NCC báo được bao nhiêu dòng), điều khoản thanh toán, phụ phí ẩn ("chưa gồm vận chuyển"), độ đầy đủ mô tả. Rẻ nhất mà thiếu vận chuyển thì nói rõ.
3. Dòng chỉ có 1 NCC báo → gợi ý NCC đó nhưng ghi "chỉ có 1 báo giá".
4. Dòng vượt CO tham chiếu → nêu rõ, gợi ý đàm phán hoặc hỏi lại.
5. Lý do ≤ 2 câu, tiếng Việt, không sáo rỗng.
6. Trả JSON đúng khuôn:
{ "summary": "<≤600 ký tự>", "lineSuggestions": [ { "rfqLineId": "<id>", "rfqVendorId": "<id NCC hoặc null>", "reason": "<≤240>" } ], "termsNotes": ["..."], "risks": ["..."] }`;
  const user = `RFQ: ${opts.rfqTitle} · mẫu ${opts.templateLabel}

MA TRẬN (đã tính sẵn):
${opts.matrixText}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
