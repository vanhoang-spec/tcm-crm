// PUR — DANH MỤC 8 MẪU FORM YÊU CẦU BÁO GIÁ (RFQ) theo NHÓM HÀNG/DỊCH VỤ.
//
// Để ở CODE theo đúng khuôn `quote-templates.ts` / `iso-catalog.ts`: mỗi mã ứng với một form có
// thật (cột dòng + điều khoản chung + CÔNG THỨC THÀNH TIỀN riêng), thêm dòng vào DB sẽ đẻ ra mẫu
// không ai render và không ai tính tiền được. Mã nhóm hàng của NCC (`VendorGroup.groupCode`) và mã
// mẫu của RFQ (`Rfq.groupCode`) là CÙNG một danh mục này — "mỗi nhóm kèm form của nhóm đó".
//
// ── ĐỢT 2 (20/08/2026): rút từ 23 FILE BÁO GIÁ THẬT chủ dự án gửi (3 lô: ACC1, ACC2, ACC3) ──────
// Thay đổi so với bản 6 mẫu ban đầu:
//   + THÊM `LOGISTICS` — 3/23 file là báo giá vận chuyển thuần (50 xe máy điện 110k/xe, bốc xếp
//     Hà Nội 3tr, "vận chuyển 1 máy đi HN 2 chiều" 20tr) và hầu như file nào cũng có dòng vận chuyển.
//   + THÊM `GOODS_PURCHASE` — 3/23 file là mua đứt hàng hoá (thẻ nhớ SanDisk, bao da tablet, 100 ghế),
//     khác hẳn "sản xuất theo yêu cầu": cần hãng/model, bảo hành, mới hay đã qua sử dụng.
//   + THÊM `OTHER` (luôn ĐỨNG CUỐI) — hứng ca chưa có nhóm; quyết định chủ dự án 20/08/2026.
//   − GỠ `SPECIAL_STRUCTURE` (mascot bay/cổng hơi) — 0/23 file thuộc loại này, và đo trên dev.db lẫn
//     production đều 0 NCC gắn nhóm đó + 0 RFQ, nên gỡ không mất dữ liệu. Ca đó tạm đi vào `OTHER`;
//     có báo giá thật thì tách lại thành nhóm riêng.
//
// ⚠ THUẾ (quyết định chủ dự án 19/08/2026): "để dạng form thôi — điền tỷ lệ % thì tính ra số tiền
// bấy nhiêu". Đã kiểm chứng công thức `tiền thuế = thành tiền × %` trên 5 file (cờ 2.200.000 → VAT 8%
// = 176.000; nhà bạt 15.300.000 → 1.224.000; cúp 27.590.000 → 2.207.200…). Mức thuế khai MỘT LẦN ở
// điều khoản làm MẶC ĐỊNH, dòng nào khác thì sửa ở chính dòng đó — vì có thật ca cùng một NCC báo hai
// mức: Huỳnh Minh (file trophy) bảng vinh danh VAT 10%, cúp VAT 8%.
//
// File THUẦN: không prisma, không server-only — client component (form NCC, form nhập hộ) import được.

export type RfqTemplateCode =
  | "EVENT_EQUIPMENT"
  | "AV_LED"
  | "POSM_RENTAL"
  | "PRODUCTION_PRINT"
  | "OUTSOURCED_STAFF"
  | "LOGISTICS"
  | "GOODS_PURCHASE"
  | "OTHER";

export const RFQ_TEMPLATE_CODES: readonly RfqTemplateCode[] = [
  "EVENT_EQUIPMENT",
  "AV_LED",
  "POSM_RENTAL",
  "PRODUCTION_PRINT",
  "OUTSOURCED_STAFF",
  "LOGISTICS",
  "GOODS_PURCHASE",
  "OTHER",
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

// ── ĐIỀU KHOẢN DÙNG CHUNG ────────────────────────────────────────────────────────────────────────

/**
 * Mức thuế MẶC ĐỊNH của cả báo giá. Dòng nào khác mức này thì NCC sửa ở cột thuế của chính dòng đó
 * (xem TAX_PCT_COL) — mô hình "khai một lần, kế thừa xuống dòng, sửa được khi khác".
 */
const TAX_TYPE_TERM: RfqTermField = {
  key: "taxType",
  labelVi: "Loại thuế mặc định",
  labelEn: "Default tax type",
  type: "text",
  hintVi: "VAT | TNCN | TNDN | KHÔNG — để trống = VAT",
  hintEn: "VAT | PIT | CIT | NONE — blank = VAT",
};
const VAT_TERM: RfqTermField = {
  key: "vatPct",
  labelVi: "Thuế suất mặc định (%)",
  labelEn: "Default tax rate (%)",
  type: "number",
  hintVi: "vd 8 hoặc 10; 0 nếu không xuất hoá đơn. Dòng nào khác mức này thì sửa ở cột thuế của dòng.",
  hintEn: "e.g. 8 or 10; 0 if no invoice. Override per line where different.",
};
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
/** File thật nào cũng có dòng "Ghi chú đơn giá trên bao gồm: …" (báo giá bảo vệ Việt Á). */
const PRICE_INCLUDES_TERM: RfqTermField = {
  key: "priceIncludes",
  labelVi: "Đơn giá đã bao gồm",
  labelEn: "Unit price includes",
  type: "textarea",
  hintVi: "vd: đồng phục, bảo hiểm, công cụ hỗ trợ, ăn ở đi lại",
  hintEn: "e.g. uniform, insurance, tools, meals & travel",
};
const NOTES_TERM: RfqTermField = { key: "otherNotes", labelVi: "Ghi chú khác / loại trừ", labelEn: "Other notes / exclusions", type: "textarea", hintVi: "vd: chưa bao gồm vận chuyển, chưa gồm điện nguồn", hintEn: "e.g. excludes transport, excludes mains power" };

/** Bộ điều khoản mọi mẫu đều có, xếp cuối phần riêng của từng mẫu. */
const COMMON_TERMS: RfqTermField[] = [TAX_TYPE_TERM, VAT_TERM, PAYMENT_TERM, VALID_UNTIL_TERM, DOCS_TERM, PRICE_INCLUDES_TERM, NOTES_TERM];

// ── CỘT DÒNG DÙNG CHUNG ──────────────────────────────────────────────────────────────────────────

/**
 * Thuê / Mua / Sản xuất — 6/23 file viết thẳng chữ này vào đầu ô mô tả ("SẢN XUẤT In 1 mặt…",
 * "THUÊ Bàn IBM 1.8m", "MUA Cụm nhỏ để bàn"), file khác tách hẳn 2 sheet MUA và THUÊ. Là phân loại
 * thật của dòng, không phải chữ trong mô tả → cho thành ô chọn.
 */
const MODE_COL: RfqLineColumn = {
  key: "mode",
  labelVi: "Thuê / Mua",
  labelEn: "Rent / Buy",
  type: "select",
  options: [
    { value: "RENT", labelVi: "Thuê", labelEn: "Rent" },
    { value: "BUY", labelVi: "Mua", labelEn: "Buy" },
    { value: "MAKE", labelVi: "Sản xuất", labelEn: "Produce" },
    { value: "SERVICE", labelVi: "Dịch vụ", labelEn: "Service" },
  ],
};
/**
 * Phương án — 5/23 file chào nhiều mức cho CÙNG một hạng mục (gian hàng 2.8tr vs 2.1tr; pin cài áo
 * 5 phương án 32k–82k; bảo vệ OPT1 80k/giờ vs OPT2 75k/giờ; "giao trong ngày" vs "lưu xe qua đêm").
 * Cùng `option` = cùng một phương án; để trống = phương án duy nhất.
 */
const OPTION_COL: RfqLineColumn = { key: "option", labelVi: "Phương án", labelEn: "Option", type: "text", hintVi: "vd: PA1 / PA2 — để trống nếu chỉ có một phương án", hintEn: "e.g. Opt1 / Opt2 — blank if single option" };
/** Khu vực — file nhà bạt tách subtotal TP.HCM và Hà Nội; file ICEHOT có hẳn cột "Địa điểm". */
const AREA_COL: RfqLineColumn = { key: "area", labelVi: "Khu vực / địa điểm", labelEn: "Area / location", type: "text", hintVi: "vd: HCM, Hà Nội — để trống nếu áp cho mọi nơi", hintEn: "e.g. HCM, Hanoi — blank if everywhere" };
/** 6/23 file có cột Hình ảnh; file trophy còn tách "ảnh mẫu" và "ảnh lên mẫu" kèm link Drive. */
const IMAGE_COL: RfqLineColumn = { key: "imageUrl", labelVi: "Link ảnh", labelEn: "Image link", type: "text", hintVi: "link Drive/ảnh sản phẩm hoặc mẫu", hintEn: "Drive link / product or sample photo" };
/** Thuế THEO DÒNG — để trống là kế thừa mức mặc định khai ở điều khoản. */
const TAX_TYPE_COL: RfqLineColumn = {
  key: "taxType",
  labelVi: "Loại thuế",
  labelEn: "Tax type",
  type: "select",
  options: [
    { value: "", labelVi: "— theo mặc định —", labelEn: "— default —" },
    { value: "VAT", labelVi: "VAT", labelEn: "VAT" },
    { value: "TNCN", labelVi: "TNCN", labelEn: "PIT" },
    { value: "TNDN", labelVi: "TNDN", labelEn: "CIT" },
    { value: "NONE", labelVi: "Không thuế", labelEn: "No tax" },
  ],
};
const TAX_PCT_COL: RfqLineColumn = { key: "taxPct", labelVi: "Thuế (%)", labelEn: "Tax (%)", type: "number", hintVi: "để trống = theo mức mặc định", hintEn: "blank = default rate" };

/** Đứng TRƯỚC cột riêng của mẫu (phân loại dòng). */
const COMMON_LEAD: RfqLineColumn[] = [MODE_COL, OPTION_COL, AREA_COL];
/** Đứng SAU cột riêng của mẫu (ảnh + thuế theo dòng). */
const COMMON_TAIL: RfqLineColumn[] = [IMAGE_COL, TAX_TYPE_COL, TAX_PCT_COL];

const SHOWS_COL: RfqLineColumn = { key: "shows", labelVi: "Số show", labelEn: "Shows", type: "number", defaultValue: 1 };
const DAYS_COL: RfqLineColumn = { key: "days", labelVi: "Số ngày", labelEn: "Days", type: "number", defaultValue: 1 };

/** Ghép cột chung + cột riêng — MỘT nguồn sự thật, khỏi lặp 6 cột ở 8 mẫu. */
function cols(specific: RfqLineColumn[]): RfqLineColumn[] {
  return [...COMMON_LEAD, ...specific, ...COMMON_TAIL];
}

export const RFQ_TEMPLATES: RfqTemplate[] = [
  {
    code: "EVENT_EQUIPMENT",
    labelVi: "Thiết bị & thi công sự kiện",
    labelEn: "Event equipment & fabrication",
    descVi: "Nhà bạt, gian hàng, sân khấu, bàn ghế, cổng chào — báo theo SL × show × ngày, kèm vận chuyển/lắp đặt theo chặng.",
    descEn: "Tents, booths, stages, furniture, arches — priced by qty × shows × days, plus transport/installation per leg.",
    lineColumns: cols([
      SHOWS_COL,
      DAYS_COL,
      { key: "tncnPct", labelVi: "TNCN (%)", labelEn: "PIT (%)", type: "number", defaultValue: 0, hintVi: "10 nếu NCC cá nhân không hoá đơn", hintEn: "10 for individual vendors without invoice" },
      { key: "transportLeg", labelVi: "Vận chuyển / chặng", labelEn: "Transport / leg", type: "text", hintVi: "vd: HCM→Sóc Trăng, đã gồm nhân sự setup", hintEn: "e.g. HCM→Soc Trang incl. setup crew" },
      // File nhà bạt ĐH Ngoại thương: "bạt đã qua sử dụng còn mới 80-85%" — ảnh hưởng giá và nghiệm thu.
      { key: "conditionPct", labelVi: "Tình trạng (% còn mới)", labelEn: "Condition (% as new)", type: "number", hintVi: "vd 85 — hàng thuê đã qua sử dụng", hintEn: "e.g. 85 — used rental stock" },
    ]),
    amountFactors: ["shows", "days"],
    unitPriceLabelVi: "Đơn giá / đơn vị / show / ngày",
    unitPriceLabelEn: "Unit price / unit / show / day",
    terms: [
      { key: "setupTime", labelVi: "Thời gian setup / bàn giao", labelEn: "Setup / handover time", type: "text" },
      { key: "powerCondition", labelVi: "Điều kiện điện nguồn", labelEn: "Mains power condition", type: "text", hintVi: "vd: TCM cấp điện 3 pha tại điểm, NCC kéo dây ≤50m", hintEn: "e.g. TCM provides 3-phase at site, vendor runs ≤50m" },
      ...COMMON_TERMS,
    ],
    keywords: ["nhà bạt", "nha bat", "gian hàng", "gian hang", "booth", "sân khấu", "san khau", "bàn ghế", "ban ghe", "cổng chào", "cong chao", "truss", "backdrop", "thi công", "thi cong"],
  },
  {
    code: "AV_LED",
    labelVi: "Âm thanh – ánh sáng – LED (AV)",
    labelEn: "Audio – lighting – LED (AV)",
    descVi: "Loa, mixer, đèn, màn LED, nhân sự kỹ thuật — báo theo ngày/show, ghi rõ model thiết bị và phụ thu ngày kế tiếp.",
    descEn: "Speakers, mixers, lights, LED walls, crew — priced per day/show, state equipment model and next-day surcharge.",
    lineColumns: cols([
      DAYS_COL,
      SHOWS_COL,
      { key: "nextDaySurchargePct", labelVi: "Phụ thu ngày kế tiếp (%)", labelEn: "Next-day surcharge (%)", type: "number", defaultValue: 0, hintVi: "vd 50 = ngày thứ 2 tính 50%", hintEn: "e.g. 50 = second day billed at 50%" },
      { key: "model", labelVi: "Model / thương hiệu thiết bị", labelEn: "Equipment model / brand", type: "text", hintVi: "vd: RCF HDL 20A, Midas M32", hintEn: "e.g. RCF HDL 20A, Midas M32" },
    ]),
    amountFactors: ["days", "shows"],
    unitPriceLabelVi: "Đơn giá / đơn vị / ngày / show",
    unitPriceLabelEn: "Unit price / unit / day / show",
    terms: [
      { key: "crew", labelVi: "Nhân sự vận hành đi kèm", labelEn: "Operating crew included", type: "text", hintVi: "vd: 3 kỹ thuật standby cả ngày", hintEn: "e.g. 3 technicians on standby all day" },
      { key: "transportMeals", labelVi: "Vận chuyển + ăn ở + trạm phí", labelEn: "Transport + accommodation + tolls", type: "text", hintVi: "đã gồm / báo riêng / bao nhiêu", hintEn: "included / separate / amount" },
      // File Bioderma ghi đủ 4 mốc ở đầu bảng ATAS — thiết bị AV luôn có 4 mốc này, không phải 1.
      { key: "loadInAt", labelVi: "Lắp đặt (load-in)", labelEn: "Load-in", type: "text", hintVi: "dd/mm hh:mm", hintEn: "dd/mm hh:mm" },
      { key: "rehearsalAt", labelVi: "Rehearsal", labelEn: "Rehearsal", type: "text", hintVi: "dd/mm hh:mm", hintEn: "dd/mm hh:mm" },
      { key: "showAt", labelVi: "Show time", labelEn: "Show time", type: "text", hintVi: "dd/mm hh:mm", hintEn: "dd/mm hh:mm" },
      { key: "loadOutAt", labelVi: "Thu hồi (load-out)", labelEn: "Load-out", type: "text", hintVi: "dd/mm hh:mm", hintEn: "dd/mm hh:mm" },
      ...COMMON_TERMS,
    ],
    keywords: ["âm thanh", "am thanh", "ánh sáng", "anh sang", "led", "loa", "mixer", "micro", "đèn", "den", "màn hình", "man hinh", "atas", "truss ánh sáng", "moving", "par led"],
  },
  {
    code: "POSM_RENTAL",
    labelVi: "POSM cho thuê",
    labelEn: "POSM rental",
    descVi: "Booth, kệ, dù, bàn ghế POSM có sẵn trong kho NCC — báo theo SL × ngày, ghi rõ lấy kho nào và có dán AW không.",
    descEn: "Booths, racks, umbrellas, POSM furniture from vendor stock — qty × days, state warehouse and whether artwork is applied.",
    lineColumns: cols([
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
      },
    ]),
    amountFactors: ["days"],
    unitPriceLabelVi: "Đơn giá thuê / đơn vị / ngày",
    unitPriceLabelEn: "Rental price / unit / day",
    terms: [
      { key: "transport", labelVi: "Vận chuyển 2 chiều + setup", labelEn: "Round-trip transport + setup", type: "text", hintVi: "đã gồm / báo riêng", hintEn: "included / separate" },
      { key: "damagePolicy", labelVi: "Đền bù nếu hư/mất", labelEn: "Damage / loss policy", type: "text", hintVi: "vd: đền theo giá trị mới", hintEn: "e.g. replacement value" },
      ...COMMON_TERMS,
    ],
    keywords: ["posm", "kệ", "ke trung bay", "dù", "du che", "quầy", "quay", "standee", "booth thuê", "booth thue", "thuê bàn", "thue ban"],
  },
  {
    code: "PRODUCTION_PRINT",
    labelVi: "Sản xuất / in ấn / quà tặng",
    labelEn: "Production / printing / gifts",
    descVi: "Cúp, huy hiệu, áo, túi, thiệp, standee — báo theo chất liệu/kích thước/kỹ thuật in, kèm CHI PHÍ LÊN MẪU và thời gian mẫu → sản xuất.",
    descEn: "Trophies, pins, apparel, bags, invitations — by material/size/print technique, incl. SAMPLE COST and sample → production lead time.",
    lineColumns: cols([
      { key: "material", labelVi: "Chất liệu", labelEn: "Material", type: "text" },
      { key: "size", labelVi: "Kích thước", labelEn: "Size", type: "text" },
      { key: "printTech", labelVi: "Kỹ thuật in / gia công", labelEn: "Print / finishing", type: "text", hintVi: "vd: in UV 1 mặt, chuyển nhiệt, ép plastic", hintEn: "e.g. 1-side UV, sublimation, laminated" },
      { key: "moq", labelVi: "MOQ", labelEn: "MOQ", type: "number" },
      // File Keppel Land tách hẳn 2 cột ngày; file trophy JBVN có "chi phí lên mẫu đợt 1 / đợt 2".
      { key: "sampleCost", labelVi: "Chi phí lên mẫu", labelEn: "Sample cost", type: "number", hintVi: "vd 300.000 — 0 nếu miễn phí", hintEn: "e.g. 300,000 — 0 if free" },
      { key: "sampleDeductible", labelVi: "Mẫu trừ vào đơn", labelEn: "Sample deducted from order", type: "bool", defaultValue: false, hintVi: "vd: mẫu 1tr, lên đơn trừ lại 50%", hintEn: "e.g. 1M sample, 50% credited on order" },
      { key: "sampleDays", labelVi: "Thời gian làm mẫu (ngày)", labelEn: "Sample lead time (days)", type: "number" },
      { key: "leadTimeDays", labelVi: "Thời gian SX sau duyệt mẫu (ngày)", labelEn: "Production after sample approval (days)", type: "number" },
    ]),
    amountFactors: [],
    unitPriceLabelVi: "Đơn giá / sản phẩm",
    unitPriceLabelEn: "Unit price / item",
    terms: [
      { key: "deposit", labelVi: "Cọc để lên đơn (%)", labelEn: "Deposit to order (%)", type: "number" },
      { key: "shipping", labelVi: "Ship / giao hàng", labelEn: "Shipping / delivery", type: "text", hintVi: "đã gồm / báo riêng", hintEn: "included / separate" },
      { key: "artworkOwner", labelVi: "File thiết kế do ai cấp", labelEn: "Artwork provided by", type: "text", hintVi: "vd: TCM gửi file AI; NCC dàn trang", hintEn: "e.g. TCM supplies AI file; vendor lays out" },
      ...COMMON_TERMS,
    ],
    keywords: ["in ấn", "in an", "cúp", "cup", "huy hiệu", "huy hieu", "kỷ niệm chương", "ky niem chuong", "áo", "ao thun", "túi", "tui", "thiệp", "thiep", "sticker", "decal", "quà tặng", "qua tang", "trophy", "bằng khen", "bang khen", "backdrop in"],
  },
  {
    code: "OUTSOURCED_STAFF",
    labelVi: "Nhân sự thuê ngoài",
    labelEn: "Outsourced staff",
    descVi: "Bảo vệ, PG/PB, bốc xếp, MC — báo theo NGÀY × NGƯỜI × GIỜ × đơn giá/GIỜ, ghi rõ vị trí và khung giờ từng ca.",
    descEn: "Guards, PG/PB, loaders, MCs — priced by DAYS × HEADCOUNT × HOURS × rate/HOUR, state position and shift window.",
    lineColumns: cols([
      DAYS_COL,
      { key: "headcount", labelVi: "Số người / ca", labelEn: "Headcount / shift", type: "number", defaultValue: 1 },
      { key: "hoursPerPerson", labelVi: "Số giờ / người", labelEn: "Hours / person", type: "number", defaultValue: 8 },
      // 4 báo giá bảo vệ KUN 2026 đều có 2 cột này; app trước đây chỉ có "ca/khung giờ".
      { key: "workDate", labelVi: "Ngày làm việc", labelEn: "Work date", type: "text", hintVi: "vd 20/04/2026 hoặc 20–24/04", hintEn: "e.g. 20/04/2026 or 20–24/04" },
      { key: "shift", labelVi: "Ca / khung giờ", labelEn: "Shift / time window", type: "text", hintVi: "vd: 19h00–08h00", hintEn: "e.g. 19:00–08:00" },
      { key: "position", labelVi: "Vị trí / nhiệm vụ", labelEn: "Position / duty", type: "text", hintVi: "vd: giữ ANTT khu vực sự kiện", hintEn: "e.g. site security, event area" },
      { key: "mealAllowance", labelVi: "Cơm / phụ cấp / người / ngày", labelEn: "Meal / allowance / person / day", type: "number", defaultValue: 0 },
    ]),
    amountFactors: ["days", "headcount", "hoursPerPerson"],
    unitPriceLabelVi: "Đơn giá / GIỜ / người",
    unitPriceLabelEn: "Rate / HOUR / person",
    terms: [
      { key: "uniformTools", labelVi: "Đồng phục / công cụ hỗ trợ", labelEn: "Uniform / equipment", type: "text", hintVi: "vd: đồng phục, bộ đàm, gậy — đã gồm", hintEn: "e.g. uniform, radio, baton — included" },
      { key: "overtimeRate", labelVi: "Đơn giá giờ phát sinh", labelEn: "Overtime hourly rate", type: "text", hintVi: "quyết toán theo giờ thực tế — xem bảng chấm công", hintEn: "settled on actual hours — see timesheet" },
      ...COMMON_TERMS,
    ],
    keywords: ["bảo vệ", "bao ve", "pg", "pb", "bốc xếp", "boc xep", "mc", "lễ tân", "le tan", "nhân sự", "nhan su", "an ninh", "antt"],
  },
  {
    code: "LOGISTICS",
    labelVi: "Vận chuyển & logistics",
    labelEn: "Transport & logistics",
    descVi: "Chở hàng/xe/thiết bị giữa các điểm — báo theo chuyến/xe, ghi rõ tuyến, loại xe, giao trong ngày hay lưu qua đêm.",
    descEn: "Moving goods/vehicles/equipment — priced per trip/vehicle, state route, vehicle type, same-day vs overnight.",
    lineColumns: cols([
      { key: "route", labelVi: "Tuyến / chặng", labelEn: "Route / leg", type: "text", hintVi: "vd: HCM → Hà Nội, 2 chiều", hintEn: "e.g. HCM → Hanoi, round trip" },
      { key: "vehicleType", labelVi: "Loại xe / phương tiện", labelEn: "Vehicle type", type: "text", hintVi: "vd: xe tải 5 tấn, xe trần không thùng", hintEn: "e.g. 5-ton truck, flatbed" },
      { key: "trips", labelVi: "Số chuyến", labelEn: "Trips", type: "number", defaultValue: 1 },
      { key: "storageDays", labelVi: "Số ngày lưu / chờ", labelEn: "Storage / waiting days", type: "number", defaultValue: 0 },
      {
        key: "deliveryWindow",
        labelVi: "Thời điểm giao",
        labelEn: "Delivery window",
        type: "select",
        options: [
          { value: "SAME_DAY", labelVi: "Trong ngày", labelEn: "Same day" },
          { value: "OVERNIGHT", labelVi: "Lưu qua đêm", labelEn: "Overnight" },
          { value: "SCHEDULED", labelVi: "Theo lịch hẹn", labelEn: "Scheduled" },
        ],
      },
    ]),
    amountFactors: ["trips"],
    unitPriceLabelVi: "Đơn giá / đơn vị / chuyến",
    unitPriceLabelEn: "Unit price / unit / trip",
    terms: [
      { key: "bookingLeadDays", labelVi: "Chốt lịch trước (ngày)", labelEn: "Booking notice (days)", type: "number", hintVi: "vd 2–3 ngày để bên xe sắp lịch", hintEn: "e.g. 2–3 days for the carrier to schedule" },
      { key: "cargoInsurance", labelVi: "Bảo hiểm hàng hoá", labelEn: "Cargo insurance", type: "text", hintVi: "có / không, mức bồi thường nếu mất-hỏng", hintEn: "yes / no, compensation if lost or damaged" },
      { key: "loadingIncluded", labelVi: "Bốc xếp lên/xuống", labelEn: "Loading / unloading", type: "text", hintVi: "đã gồm / báo riêng / bao nhiêu người", hintEn: "included / separate / crew size" },
      { key: "waitingFee", labelVi: "Phí chờ ngoài giờ hẹn", labelEn: "Waiting fee", type: "text" },
      ...COMMON_TERMS,
    ],
    keywords: ["vận chuyển xe", "van chuyen xe", "xe tải", "xe tai", "cẩu", "cau hang", "bốc xếp", "boc xep", "logistics", "cước", "cuoc van chuyen", "chuyển kho", "chuyen kho"],
  },
  {
    code: "GOODS_PURCHASE",
    labelVi: "Mua sắm thiết bị / hàng hoá",
    labelEn: "Equipment & goods purchase",
    descVi: "Mua đứt hàng có sẵn trên thị trường (thẻ nhớ, bao da, bàn ghế, VPP) — ghi rõ hãng/model, bảo hành, hàng mới hay đã qua sử dụng.",
    descEn: "Off-the-shelf purchases (memory cards, cases, furniture, stationery) — state brand/model, warranty, new or used.",
    lineColumns: cols([
      { key: "brandModel", labelVi: "Hãng / model", labelEn: "Brand / model", type: "text", hintVi: "vd: SanDisk Ultra 128GB", hintEn: "e.g. SanDisk Ultra 128GB" },
      { key: "warranty", labelVi: "Bảo hành", labelEn: "Warranty", type: "text", hintVi: "vd: 12 tháng chính hãng", hintEn: "e.g. 12 months manufacturer" },
      { key: "orderLeadDays", labelVi: "Thời gian đặt hàng (ngày)", labelEn: "Order lead time (days)", type: "number" },
      {
        key: "condition",
        labelVi: "Tình trạng hàng",
        labelEn: "Condition",
        type: "select",
        options: [
          { value: "NEW", labelVi: "Mới 100%", labelEn: "Brand new" },
          { value: "USED", labelVi: "Đã qua sử dụng", labelEn: "Used" },
        ],
        defaultValue: "NEW",
      },
    ]),
    amountFactors: [],
    unitPriceLabelVi: "Đơn giá / sản phẩm",
    unitPriceLabelEn: "Unit price / item",
    terms: [
      { key: "returnPolicy", labelVi: "Đổi trả", labelEn: "Return policy", type: "text", hintVi: "vd: đổi trong 7 ngày nếu lỗi NSX", hintEn: "e.g. 7-day exchange for manufacturing defects" },
      { key: "shipping", labelVi: "Ship / giao hàng", labelEn: "Shipping / delivery", type: "text", hintVi: "đã gồm / báo riêng", hintEn: "included / separate" },
      { key: "invoiceType", labelVi: "Loại hoá đơn", labelEn: "Invoice type", type: "text", hintVi: "vd: hoá đơn VAT / bán lẻ", hintEn: "e.g. VAT invoice / retail receipt" },
      ...COMMON_TERMS,
    ],
    keywords: ["thẻ nhớ", "the nho", "bao da", "laptop", "máy tính", "may tinh", "điện thoại", "dien thoai", "văn phòng phẩm", "van phong pham", "nội thất", "noi that", "mua ghế", "mua ghe", "mua bàn", "mua ban", "sim", "pin sạc", "pin sac"],
  },
  {
    // ĐỨNG CUỐI DANH SÁCH (quyết định chủ dự án 20/08/2026). Không có keyword → không bao giờ tự gợi ý;
    // PUR chọn tay khi nhu cầu chưa thuộc 7 nhóm trên. Mascot bay / cổng hơi tạm nằm ở đây.
    code: "OTHER",
    labelVi: "Khác",
    labelEn: "Other",
    descVi: "Nhu cầu chưa thuộc nhóm nào — chỉ cột cơ bản, mô tả tự do. Nếu một loại lặp lại nhiều lần thì tách thành nhóm riêng.",
    descEn: "Anything not covered above — basic columns and free-text description. Recurring types should get their own group.",
    lineColumns: cols([{ key: "spec", labelVi: "Quy cách / yêu cầu", labelEn: "Spec / requirement", type: "text" }]),
    amountFactors: [],
    unitPriceLabelVi: "Đơn giá / đơn vị",
    unitPriceLabelEn: "Unit price / unit",
    terms: [...COMMON_TERMS],
    keywords: [],
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
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Gợi ý mẫu từ tên các dòng CO — đếm từ khoá trúng THEO RANH GIỚI TỪ (khoá "ao" không được trúng
 * "bao ve"), mẫu nhiều nhất thắng; hoà thì mẫu đứng trước trong danh mục. CHỈ GỢI Ý — PUR chọn lại
 * được. Trả null khi không trúng gì (kể cả `OTHER`, mẫu này không có từ khoá).
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
 * - OUTSOURCED_STAFF: cộng thêm cơm/phụ cấp × người × ngày (file BV Miền Bắc: cột "Tổng tiền cơm").
 *   Công thức ngày × người × giờ × đơn giá/giờ đã được kiểm chứng trên 4 báo giá bảo vệ thật của
 *   KUN 2026 (Bình Dương 13×2×50.000 = 1.300.000; Thái Bình 5×2×12×80.000 = 9.600.000 …).
 */
export function computeQuoteLineAmount(template: RfqTemplate, input: QuoteLineInput): number {
  const qty = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0;
  const price = Number.isFinite(input.unitPrice) && input.unitPrice >= 0 ? input.unitPrice : 0;
  const extra = input.extra ?? {};

  let amount = qty * price;
  for (const f of template.amountFactors) amount *= factorOf(extra, f);

  if (template.code === "OUTSOURCED_STAFF") {
    // cơm/phụ cấp tính theo NGƯỜI × NGÀY, không nhân theo giờ
    amount += numOf(extra, "mealAllowance") * factorOf(extra, "headcount") * factorOf(extra, "days") * (qty > 0 ? 1 : 0);
  }
  return Math.round(amount);
}

// ── THUẾ: điền % → ra tiền (quyết định chủ dự án 19/08/2026) ─────────────────────────────────────

export const QUOTE_TAX_TYPES = ["VAT", "TNCN", "TNDN", "NONE"] as const;
export type QuoteTaxType = (typeof QUOTE_TAX_TYPES)[number];

export type QuoteTaxLine = {
  amount: number;
  /** Rỗng = kế thừa mức mặc định của cả báo giá. */
  taxType?: string | null;
  taxPct?: number | null;
};

export type QuoteTotals = {
  subtotal: number;
  /** Tách theo "VAT 8%", "VAT 10%", "TNCN 10%"… đúng cách các file báo giá thật trình bày. */
  taxBreakdown: { label: string; taxType: QuoteTaxType; pct: number; amount: number }[];
  taxTotal: number;
  total: number;
};

function normTaxType(raw: unknown, fallback: QuoteTaxType): QuoteTaxType {
  const v = String(raw ?? "").trim().toUpperCase();
  return (QUOTE_TAX_TYPES as readonly string[]).includes(v) ? (v as QuoteTaxType) : fallback;
}
/**
 * ⚠ Trả null nghĩa là "KHÔNG khai — kế thừa mức mặc định", khác hẳn 0 nghĩa là "không chịu thuế".
 * Phải loại null/undefined/chuỗi rỗng TRƯỚC khi gọi Number: `Number(null)` ra 0 chứ không phải NaN,
 * nên bản đầu đọc dòng để trống thành 0% và ăn mất tiền thuế của dòng đó, im lặng (bắt được lúc test).
 */
function normPct(raw: unknown): number | null {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * Σ thành tiền → tiền thuế → tổng thanh toán.
 *
 * ⚠ Thuế cộng THÊM lên thành tiền (`tiền thuế = thành tiền × %`) — đúng cách 23/23 file báo giá thật
 * đang tính, kể cả dòng TNCN (cán cờ gỗ 300.000 → TNCN 10% = 30.000 → tổng 330.000).
 * KHÁC với quy ước gross-up ÷0,9 mà CO/CE đang dùng cho TNCN (HANDOVER mục 6) — chênh ~1,1%.
 * ⚠ Chủ dự án CHỐT 20/08/2026: **lấy theo file NCC (cộng thêm %)**, tức đúng hàm này. `TAX_GROSSUP`
 * bên `lib/bidding.ts` GIỮ NGUYÊN — sửa hằng đó là làm lệch coTotal của mọi dòng CO đang chạy. Khi
 * ghi dòng NCC vào CO thì dùng `taxType="OTHER"` + `customTaxAmount` để `amount` khớp từng đồng với
 * số NCC đòi; xem HANDOVER mục 10.46.
 */
export function computeQuoteTotals(lines: QuoteTaxLine[], defaults: { taxType?: string | null; taxPct?: number | null }): QuoteTotals {
  const defType = normTaxType(defaults.taxType, "VAT");
  const defPct = normPct(defaults.taxPct) ?? 0;

  let subtotal = 0;
  const buckets = new Map<string, { label: string; taxType: QuoteTaxType; pct: number; amount: number }>();

  for (const l of lines) {
    const amount = Number.isFinite(l.amount) ? Math.round(l.amount) : 0;
    subtotal += amount;

    const type = normTaxType(l.taxType, defType);
    const pct = normPct(l.taxPct) ?? defPct;
    if (type === "NONE" || pct <= 0 || amount === 0) continue;

    const tax = Math.round((amount * pct) / 100);
    const key = `${type}|${pct}`;
    const prev = buckets.get(key);
    if (prev) prev.amount += tax;
    else buckets.set(key, { label: `${type} ${pct}%`, taxType: type, pct, amount: tax });
  }

  const taxBreakdown = [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));
  const taxTotal = taxBreakdown.reduce((s, b) => s + b.amount, 0);
  return { subtotal, taxBreakdown, taxTotal, total: subtotal + taxTotal };
}

/**
 * Bọc `computeQuoteTotals` cho đúng cách báo giá được LƯU: thuế theo dòng nằm trong `extraJson`
 * (cột `taxType`/`taxPct`), mức mặc định nằm trong `termsJson` (`taxType`/`vatPct`). Nhờ vậy KHÔNG
 * cần cột mới nào trong DB — tổng luôn tính lúc đọc, đúng như `amount` đang làm.
 *
 * MỘT nguồn sự thật cho: form NCC, trang chi tiết RFQ, bảng so sánh, file Excel mẫu.
 */
export function quoteTotalsOf(lines: { amount: number; extra?: Record<string, unknown> | null }[], terms: Record<string, unknown> | null | undefined): QuoteTotals {
  return computeQuoteTotals(
    lines.map((l) => ({ amount: l.amount, taxType: (l.extra?.taxType as string | undefined) ?? null, taxPct: (l.extra?.taxPct as number | undefined) ?? null })),
    { taxType: (terms?.taxType as string | undefined) ?? null, taxPct: (terms?.vatPct as number | undefined) ?? null },
  );
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
