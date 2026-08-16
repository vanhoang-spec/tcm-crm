// PUR-1 — DANH MỤC 6 MẪU FORM YÊU CẦU BÁO GIÁ (RFQ) theo NHÓM HÀNG/DỊCH VỤ.
//
// Để ở CODE theo đúng khuôn `quote-templates.ts` / `iso-catalog.ts`: mỗi mã ứng với một form có
// thật (cột dòng + điều khoản chung + CÔNG THỨC THÀNH TIỀN riêng), thêm dòng vào DB sẽ đẻ ra mẫu
// không ai render và không ai tính tiền được. Mã nhóm hàng của NCC (`VendorGroup.groupCode`) và mã
// mẫu của RFQ (`Rfq.groupCode`) là CÙNG một danh mục này — "mỗi nhóm kèm form của nhóm đó".
//
// 6 mẫu rút từ 12 file báo giá thật PUR đã nhận (D:\TCM\PUR\ANH HOÀNG BÁO GIÁ, 15/08/2026):
// - Thiết bị sự kiện (Thiện Sự Kiện, Nam Thái Dương, Sông Lam): SL × số show × số ngày × đơn giá,
//   tách VAT 8% + TNCN 10%, vận chuyển theo TỈNH/chặng.
// - AV/LED (Anh Vũ, Trường Nguyên, Vietart): ngày × show × đơn giá, "phụ thu 50% ngày kế tiếp".
// - POSM cho thuê (file RFQ TCM tự gửi): SL × ngày, cột "HÀ NỘI" (lấy kho nào), dán AW.
// - Sản xuất/in ấn/quà (huy chương, cúp, áo, thẻ): chất liệu, kích thước, kỹ thuật in, MOQ, lead time.
// - Nhân sự thuê ngoài (2 cty bảo vệ): ngày × người/ca × giờ/người × đơn giá/GIỜ, cơm 30k.
// - Mô hình đặc biệt (PCC mascot bay): bảng theo PHƯƠNG ÁN, 4 khối chi phí (sản xuất/khí/vận hành/vận chuyển).
//
// File THUẦN: không prisma, không server-only — client component (form NCC, form nhập hộ) import được.

export type RfqTemplateCode =
  | "EVENT_EQUIPMENT"
  | "AV_LED"
  | "POSM_RENTAL"
  | "PRODUCTION_PRINT"
  | "OUTSOURCED_STAFF"
  | "SPECIAL_STRUCTURE";

export const RFQ_TEMPLATE_CODES: readonly RfqTemplateCode[] = [
  "EVENT_EQUIPMENT",
  "AV_LED",
  "POSM_RENTAL",
  "PRODUCTION_PRINT",
  "OUTSOURCED_STAFF",
  "SPECIAL_STRUCTURE",
] as const;

/** Cột mở rộng trên TỪNG DÒNG báo giá (ngoài bộ cột chuẩn STT/Hạng mục/Mô tả/ĐVT/SL/Đơn giá/Thành tiền/Ghi chú). */
export type RfqLineColumn = {
  key: string;
  labelVi: string;
  labelEn: string;
  type: "number" | "text" | "select" | "bool";
  /** Với type=select. */
  options?: { value: string; labelVi: string; labelEn: string }[];
  /** Giá trị mặc định NCC nhìn thấy sẵn (vd shows=1, days=1). */
  defaultValue?: number | string | boolean;
  /** Gợi ý ngắn dưới ô. */
  hintVi?: string;
  hintEn?: string;
};

/** Điều khoản chung NCC điền MỘT LẦN cho cả báo giá (không theo dòng). */
export type RfqTermField = {
  key: string;
  labelVi: string;
  labelEn: string;
  type: "number" | "text" | "textarea";
  hintVi?: string;
  hintEn?: string;
};

export type RfqTemplate = {
  code: RfqTemplateCode;
  labelVi: string;
  labelEn: string;
  descVi: string;
  descEn: string;
  lineColumns: RfqLineColumn[];
  /**
   * Cột NHÂN vào thành tiền: amount = quantity × Π(extra[factor]) × unitPrice.
   * Rỗng = amount = quantity × unitPrice. Cột factor thiếu/không hợp lệ coi như 1 (không phá số).
   */
  amountFactors: string[];
  /** Nhãn đơn giá — nhắc NCC báo theo đơn vị nào (vd "/giờ/người" ở mẫu nhân sự). */
  unitPriceLabelVi: string;
  unitPriceLabelEn: string;
  terms: RfqTermField[];
  /** Từ khoá gợi ý mẫu từ tên dòng CO (chữ thường, không dấu cũng được) — CHỈ gợi ý, PUR chọn lại. */
  keywords: string[];
};

const VAT_TERM: RfqTermField = { key: "vatPct", labelVi: "VAT (%)", labelEn: "VAT (%)", type: "number", hintVi: "0 nếu không xuất hoá đơn", hintEn: "0 if no invoice" };
const PAYMENT_TERM: RfqTermField = {
  key: "paymentTerms",
  labelVi: "Điều khoản thanh toán",
  labelEn: "Payment terms",
  type: "textarea",
  hintVi: "vd: cọc 50% để lên đơn, còn lại sau khi xuất hoá đơn",
  hintEn: "e.g. 50% deposit to order, balance after invoice",
};
const VALID_UNTIL_TERM: RfqTermField = { key: "validUntil", labelVi: "Báo giá có hiệu lực đến", labelEn: "Quote valid until", type: "text", hintVi: "dd/mm/yyyy", hintEn: "dd/mm/yyyy" };
const DOCS_TERM: RfqTermField = { key: "documents", labelVi: "Chứng từ quyết toán", labelEn: "Settlement documents", type: "text", hintVi: "vd: hợp đồng + hoá đơn VAT", hintEn: "e.g. contract + VAT invoice" };
const NOTES_TERM: RfqTermField = { key: "otherNotes", labelVi: "Ghi chú khác / loại trừ", labelEn: "Other notes / exclusions", type: "textarea", hintVi: "vd: chưa bao gồm vận chuyển, chưa gồm điện nguồn", hintEn: "e.g. excludes transport, excludes mains power" };

const SHOWS_COL: RfqLineColumn = { key: "shows", labelVi: "Số show", labelEn: "Shows", type: "number", defaultValue: 1 };
const DAYS_COL: RfqLineColumn = { key: "days", labelVi: "Số ngày", labelEn: "Days", type: "number", defaultValue: 1 };

export const RFQ_TEMPLATES: RfqTemplate[] = [
  {
    code: "EVENT_EQUIPMENT",
    labelVi: "Thiết bị & thi công sự kiện",
    labelEn: "Event equipment & build",
    descVi: "Nhà giàn, sàn sân khấu, rào an ninh, thùng đối trọng, LED, điện, âm thanh cơ bản — báo theo SL × show × ngày.",
    descEn: "Tents, stage floors, security fence, ballast, LED, power, basic sound — priced by qty × shows × days.",
    lineColumns: [
      SHOWS_COL,
      DAYS_COL,
      { key: "tncnPct", labelVi: "TNCN (%)", labelEn: "PIT (%)", type: "number", defaultValue: 0, hintVi: "10 nếu NCC cá nhân không hoá đơn", hintEn: "10 for individual vendors without invoice" },
      { key: "transportLeg", labelVi: "Vận chuyển / chặng", labelEn: "Transport / leg", type: "text", hintVi: "vd: HCM→Sóc Trăng, đã gồm nhân sự setup", hintEn: "e.g. HCM→Soc Trang incl. setup crew" },
    ],
    amountFactors: ["shows", "days"],
    unitPriceLabelVi: "Đơn giá / đơn vị / show / ngày",
    unitPriceLabelEn: "Unit price / unit / show / day",
    terms: [
      { key: "setupTime", labelVi: "Thời gian setup / bàn giao", labelEn: "Setup / handover time", type: "text" },
      { key: "powerCondition", labelVi: "Điều kiện điện nguồn", labelEn: "Mains power condition", type: "text", hintVi: "vd: TCM cấp điện 3 pha tại điểm, NCC kéo dây ≤50m", hintEn: "e.g. TCM provides 3-phase at site, vendor runs ≤50m" },
      VAT_TERM,
      PAYMENT_TERM,
      DOCS_TERM,
      VALID_UNTIL_TERM,
      NOTES_TERM,
    ],
    keywords: ["nhà giàn", "nha gian", "sàn sân khấu", "san san khau", "rào", "rao an ninh", "fence", "đối trọng", "doi trong", "truss", "led", "màn hình", "man hinh", "hệ thống điện", "he thong dien", "quạt", "quat", "đèn", "den", "cổng hơi", "cong hoi", "barrier"],
  },
  {
    code: "AV_LED",
    labelVi: "Âm thanh – ánh sáng – LED (AV)",
    labelEn: "Audio – lighting – LED (AV)",
    descVi: "Hệ thống âm thanh line array, đèn moving/wash, LED indoor/outdoor, mapping — báo theo ngày × show, phụ thu ngày kế tiếp.",
    descEn: "Line-array audio, moving/wash lights, indoor/outdoor LED, mapping — priced by days × shows, next-day surcharge.",
    lineColumns: [
      DAYS_COL,
      SHOWS_COL,
      { key: "nextDaySurchargePct", labelVi: "Phụ thu ngày kế tiếp (%)", labelEn: "Next-day surcharge (%)", type: "number", defaultValue: 0, hintVi: "vd 50 = ngày thứ 2 tính 50%", hintEn: "e.g. 50 = second day billed at 50%" },
      { key: "model", labelVi: "Model / thương hiệu thiết bị", labelEn: "Equipment model / brand", type: "text", hintVi: "vd: RCF HDL 20A, Midas M32", hintEn: "e.g. RCF HDL 20A, Midas M32" },
    ],
    amountFactors: ["days", "shows"],
    unitPriceLabelVi: "Đơn giá / đơn vị / ngày / show",
    unitPriceLabelEn: "Unit price / unit / day / show",
    terms: [
      { key: "crew", labelVi: "Nhân sự vận hành đi kèm", labelEn: "Operating crew included", type: "text", hintVi: "vd: 3 kỹ thuật standby cả ngày", hintEn: "e.g. 3 technicians on standby all day" },
      { key: "transportMeals", labelVi: "Vận chuyển + ăn ở + trạm phí", labelEn: "Transport + accommodation + tolls", type: "text", hintVi: "đã gồm / báo riêng / bao nhiêu", hintEn: "included / separate / amount" },
      VAT_TERM,
      PAYMENT_TERM,
      VALID_UNTIL_TERM,
      NOTES_TERM,
    ],
    keywords: ["âm thanh", "am thanh", "ánh sáng", "anh sang", "loa", "micro", "mixer", "moving", "wash", "beam", "led p3", "mapping", "laser", "line array", "daylight", "follow"],
  },
  {
    code: "POSM_RENTAL",
    labelVi: "POSM cho thuê",
    labelEn: "POSM rental",
    descVi: "Bàn ghế, dù, lều, bục, khay, hoa — thuê theo SL × ngày; ghi rõ lấy từ kho nào và có dán artwork không.",
    descEn: "Tables, chairs, umbrellas, tents, podium, trays, flowers — rental by qty × days; state warehouse and artwork.",
    lineColumns: [
      DAYS_COL,
      { key: "hasArtwork", labelVi: "Có dán AW / in", labelEn: "Artwork applied", type: "bool", defaultValue: false },
      {
        key: "warehouse",
        labelVi: "Lấy từ kho",
        labelEn: "From warehouse",
        type: "select",
        options: [
          { value: "HCM", labelVi: "HCM", labelEn: "HCM" },
          { value: "HN", labelVi: "Hà Nội", labelEn: "Hanoi" },
          { value: "OTHER", labelVi: "Khác", labelEn: "Other" },
        ],
        defaultValue: "HCM",
      },
    ],
    amountFactors: ["days"],
    unitPriceLabelVi: "Đơn giá thuê / đơn vị / ngày",
    unitPriceLabelEn: "Rental price / unit / day",
    terms: [
      { key: "transport", labelVi: "Vận chuyển 2 chiều + setup", labelEn: "Round-trip transport + setup", type: "text", hintVi: "đã gồm / báo riêng", hintEn: "included / separate" },
      VAT_TERM,
      PAYMENT_TERM,
      VALID_UNTIL_TERM,
      NOTES_TERM,
    ],
    keywords: ["bàn", "ban dai bieu", "ghế", "ghe", "dù", "du che", "lều", "leu", "bục", "buc phat bieu", "khay", "hoa", "khăn", "khan", "thuê", "thue"],
  },
  {
    code: "PRODUCTION_PRINT",
    labelVi: "Sản xuất / in ấn / quà tặng",
    labelEn: "Production / printing / gifts",
    descVi: "Huy chương, cúp, áo, thẻ đeo, ruy băng, backdrop in — cần chất liệu, kích thước, kỹ thuật in, MOQ và thời gian sản xuất.",
    descEn: "Medals, trophies, shirts, badges, ribbons, printed backdrops — needs material, size, print technique, MOQ, lead time.",
    lineColumns: [
      { key: "material", labelVi: "Chất liệu", labelEn: "Material", type: "text" },
      { key: "size", labelVi: "Kích thước", labelEn: "Size", type: "text" },
      { key: "printTech", labelVi: "Kỹ thuật in / gia công", labelEn: "Print / finishing", type: "text", hintVi: "vd: in UV 1 mặt, chuyển nhiệt, ép plastic", hintEn: "e.g. 1-side UV, sublimation, laminated" },
      { key: "moq", labelVi: "MOQ", labelEn: "MOQ", type: "number" },
      { key: "leadTimeDays", labelVi: "Thời gian SX (ngày)", labelEn: "Lead time (days)", type: "number" },
    ],
    amountFactors: [],
    unitPriceLabelVi: "Đơn giá / đơn vị",
    unitPriceLabelEn: "Unit price / unit",
    terms: [
      { key: "deposit", labelVi: "Cọc để lên đơn (%)", labelEn: "Deposit to order (%)", type: "number" },
      { key: "shipping", labelVi: "Ship / giao hàng", labelEn: "Shipping / delivery", type: "text", hintVi: "đã gồm / báo riêng", hintEn: "included / separate" },
      VAT_TERM,
      PAYMENT_TERM,
      VALID_UNTIL_TERM,
      NOTES_TERM,
    ],
    keywords: ["huy chương", "huy chuong", "cúp", "cup", "áo", "ao", "thẻ", "the deo", "ruy băng", "ruy bang", "in ", "certificate", "cờ", "co luan luu", "quà", "qua tang", "backdrop", "hiflex", "decal", "standee"],
  },
  {
    code: "OUTSOURCED_STAFF",
    labelVi: "Nhân sự thuê ngoài",
    labelEn: "Outsourced staff",
    descVi: "Bảo vệ, y tế, chụp/quay, PG, kỹ thuật — báo theo ngày × số người/ca × số giờ/người × đơn giá/GIỜ.",
    descEn: "Security, medics, photo/video, promoters, technicians — priced by days × headcount/shift × hours/person × rate per HOUR.",
    lineColumns: [
      DAYS_COL,
      { key: "headcount", labelVi: "Số người / ca", labelEn: "Headcount / shift", type: "number", defaultValue: 1 },
      { key: "hoursPerPerson", labelVi: "Số giờ / người", labelEn: "Hours / person", type: "number", defaultValue: 8 },
      { key: "shift", labelVi: "Ca / khung giờ", labelEn: "Shift / time window", type: "text", hintVi: "vd: 20h00–08h00", hintEn: "e.g. 20:00–08:00" },
      { key: "mealAllowance", labelVi: "Cơm / phụ cấp / người / ngày", labelEn: "Meal / allowance / person / day", type: "number", defaultValue: 0 },
    ],
    amountFactors: ["days", "headcount", "hoursPerPerson"],
    unitPriceLabelVi: "Đơn giá / GIỜ / người",
    unitPriceLabelEn: "Rate / HOUR / person",
    terms: [
      { key: "uniformTools", labelVi: "Đồng phục / công cụ hỗ trợ", labelEn: "Uniform / equipment", type: "text", hintVi: "vd: đồng phục, bộ đàm, gậy — đã gồm", hintEn: "e.g. uniform, radio, baton — included" },
      VAT_TERM,
      PAYMENT_TERM,
      VALID_UNTIL_TERM,
      NOTES_TERM,
    ],
    keywords: ["bảo vệ", "bao ve", "y tế", "y te", "chụp hình", "chup hinh", "quay phim", "pg", "pb", "mc", "nhân sự", "nhan su", "kỹ thuật", "ky thuat", "trọng tài", "trong tai"],
  },
  {
    code: "SPECIAL_STRUCTURE",
    labelVi: "Mô hình / hạng mục đặc biệt",
    labelEn: "Special structures / installations",
    descVi: "Mascot bay, cổng hơi, mô hình lớn — báo theo PHƯƠNG ÁN với 4 khối: sản xuất, vật tư (khí), vận hành/ngày, vận chuyển.",
    descEn: "Inflatable mascots, arches, large models — priced per OPTION in 4 blocks: production, materials (gas), ops/day, transport.",
    lineColumns: [
      { key: "option", labelVi: "Phương án", labelEn: "Option", type: "text", hintVi: "vd: bay neo cố định – Heli / thổi khí mặt đất", hintEn: "e.g. tethered helium / ground blower" },
      { key: "productionCost", labelVi: "Chi phí sản xuất", labelEn: "Production cost", type: "number" },
      { key: "materialCost", labelVi: "Vật tư (khí / điện)", labelEn: "Materials (gas / power)", type: "number" },
      { key: "opsPerDay", labelVi: "Vận hành / ngày", labelEn: "Operations / day", type: "number" },
      { key: "opsDays", labelVi: "Số ngày vận hành", labelEn: "Ops days", type: "number", defaultValue: 1 },
      { key: "transportCost", labelVi: "Vận chuyển", labelEn: "Transport", type: "number" },
    ],
    // Mẫu này KHÔNG có "đơn giá" đơn lẻ — thành tiền = Σ 4 khối (xem computeQuoteLineAmount).
    amountFactors: [],
    unitPriceLabelVi: "— (thành tiền = Σ 4 khối)",
    unitPriceLabelEn: "— (amount = Σ 4 blocks)",
    terms: [
      { key: "siteCondition", labelVi: "Điều kiện mặt bằng / neo", labelEn: "Site / anchoring conditions", type: "textarea" },
      { key: "opsWeekMonth", labelVi: "Vận hành theo tuần / tháng", labelEn: "Weekly / monthly operation", type: "textarea", hintVi: "chi phí phát sinh nếu kéo dài", hintEn: "extra cost if extended" },
      VAT_TERM,
      PAYMENT_TERM,
      VALID_UNTIL_TERM,
      NOTES_TERM,
    ],
    keywords: ["mascot", "mô hình", "mo hinh", "cổng hơi", "cong hoi", "bay", "heli", "thổi", "thoi hoi", "inflatable"],
  },
];

export function resolveRfqTemplate(code: string | null | undefined): RfqTemplate | null {
  return RFQ_TEMPLATES.find((t) => t.code === code) ?? null;
}

export function isRfqTemplateCode(code: string): code is RfqTemplateCode {
  return (RFQ_TEMPLATE_CODES as readonly string[]).includes(code);
}

/** Bỏ dấu tiếng Việt để so từ khoá không phân biệt dấu. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Gợi ý mẫu từ tên các dòng CO — đếm từ khoá trúng THEO RANH GIỚI TỪ (khoá "ao" không được trúng
 * "bao ve"), mẫu nhiều nhất thắng; hoà thì mẫu đứng trước trong danh mục. CHỈ GỢI Ý — PUR chọn lại
 * được. Trả null khi không trúng gì.
 */
export function suggestRfqTemplate(lineNames: string[]): RfqTemplateCode | null {
  const hay = ` ${lineNames.map(fold).join(" ")} `;
  let best: { code: RfqTemplateCode; hits: number } | null = null;
  for (const t of RFQ_TEMPLATES) {
    const hits = t.keywords.reduce((n, kw) => (hay.includes(` ${fold(kw)} `) ? n + 1 : n), 0);
    if (hits > 0 && (!best || hits > best.hits)) best = { code: t.code, hits };
  }
  return best?.code ?? null;
}

export type QuoteLineInput = {
  quantity: number;
  unitPrice: number;
  extra: Record<string, unknown>;
};

/** Đọc một hệ số nhân từ extra: số hữu hạn > 0 thì dùng, còn lại coi như 1 (không phá số). */
function factorOf(extra: Record<string, unknown>, key: string): number {
  const v = Number(extra[key]);
  return Number.isFinite(v) && v > 0 ? v : 1;
}
function numOf(extra: Record<string, unknown>, key: string): number {
  const v = Number(extra[key]);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * THÀNH TIỀN của một dòng báo giá — MỘT nguồn sự thật cho cổng NCC, form nhập hộ, AI bóc file và
 * server (server luôn tính lại, không tin số client). Trả số nguyên VND (làm tròn).
 *
 * - Mặc định: quantity × Π(amountFactors) × unitPrice. Factor thiếu = 1.
 * - SPECIAL_STRUCTURE: Σ(sản xuất + vật tư + vận hành/ngày × số ngày + vận chuyển) — mẫu này báo
 *   theo KHỐI, không có đơn giá đơn lẻ (đúng file mascot PCC: 60tr + 50tr + 70tr + 10tr).
 * - OUTSOURCED_STAFF: cộng thêm cơm/phụ cấp × người × ngày (file BV Miền Bắc: cột "Tổng tiền cơm").
 */
export function computeQuoteLineAmount(template: RfqTemplate, input: QuoteLineInput): number {
  const qty = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0;
  const price = Number.isFinite(input.unitPrice) && input.unitPrice >= 0 ? input.unitPrice : 0;
  const extra = input.extra ?? {};

  if (template.code === "SPECIAL_STRUCTURE") {
    const opsDays = factorOf(extra, "opsDays");
    return Math.round(numOf(extra, "productionCost") + numOf(extra, "materialCost") + numOf(extra, "opsPerDay") * opsDays + numOf(extra, "transportCost"));
  }

  let amount = qty * price;
  for (const f of template.amountFactors) amount *= factorOf(extra, f);

  if (template.code === "OUTSOURCED_STAFF") {
    // cơm/phụ cấp tính theo NGƯỜI × NGÀY, không nhân theo giờ
    amount += numOf(extra, "mealAllowance") * factorOf(extra, "headcount") * factorOf(extra, "days") * (qty > 0 ? 1 : 0);
  }
  return Math.round(amount);
}

/** Đọc extraJson an toàn — JSON hỏng/không phải object → {} (không ném lỗi ra UI). */
export function parseExtraJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
