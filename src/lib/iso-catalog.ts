/**
 * DANH MỤC 25 LOẠI HỒ SƠ ISO — nguồn sự thật duy nhất.
 *
 * Lấy nguyên từ sheet "HS ISO" của file `Các hồ sơ kiểm tra ISO.xlsx` (cột 7→31). Bốn cột đầu của
 * sheet (Mã dự án / Team / Project Owner / Link Hồ sơ / Status) là METADATA, không nằm ở đây — chúng
 * đọc thẳng từ `Project`.
 *
 * Vì sao để trong CODE chứ không phải bảng DB như OptionSet: mỗi mã `AUTO` dưới đây phải có một
 * nhánh tương ứng trong `resolveIsoDocs()` (src/lib/iso-report.ts). Thêm một dòng vào DB sẽ tạo ra
 * mục hồ sơ không ai chấm được — tưởng đã theo dõi mà thực tế luôn trống.
 *
 * Nhãn song ngữ đi qua `pickLabel()` như OptionItem và permission-catalog — không đẻ thêm 50 key
 * i18n cho danh mục thuần dữ liệu (xem HANDOVER 4.2: luật parity vẫn giữ, chỉ phần chrome mới cần key).
 *
 * ⚠ `code` là mã BẤT BIẾN, đã ghi vào `ProjectIsoDoc.docCode` trong DB. Đổi mã = mất hết phần PIC
 * đã đính file/đánh N/A. Đổi được: nhãn, thứ tự, `kind`.
 */

export type IsoDocKind =
  /** App tự chấm được từ dữ liệu sẵn có — xem nhánh tương ứng trong resolveIsoDocs(). */
  | "AUTO"
  /** App không có chỗ chứa — PIC phải đính file hoặc dán link tay. */
  | "MANUAL";

export type IsoDocDef = {
  code: string;
  labelVi: string;
  labelEn: string;
  /** Diễn giải dài của ISO (nếu có) — hiện dạng tooltip, không dùng làm nhãn cột. */
  hintVi?: string;
  hintEn?: string;
  kind: IsoDocKind;
  /** ISO ghi "nếu có" — thiếu KHÔNG tính là không đạt. */
  optional?: boolean;
};

export const ISO_DOCS: IsoDocDef[] = [
  { code: "ISO-01", kind: "AUTO", labelVi: "Brief Files", labelEn: "Brief files" },
  { code: "ISO-02", kind: "AUTO", labelVi: "Proposal", labelEn: "Proposal" },
  {
    code: "ISO-03",
    kind: "MANUAL",
    labelVi: "Báo giá",
    labelEn: "Quotation",
    hintVi: "App dựng được bản báo giá BM02 từ CO/CE, nhưng KHÔNG lưu bản đã thực sự gửi khách — đính bản đã gửi vào đây.",
    hintEn: "The app can render the BM02 quotation from the cost sheet, but does not store the copy actually sent to the client — attach that copy here.",
  },
  { code: "ISO-04", kind: "AUTO", labelVi: "CECO dự toán", labelEn: "Budget cost sheet (CECO)" },
  { code: "ISO-05", kind: "AUTO", labelVi: "PO: Đơn đặt hàng", labelEn: "PO: client purchase order" },
  { code: "ISO-06", kind: "AUTO", labelVi: "Hợp đồng dịch vụ + PL HĐDV", labelEn: "Service contract + appendices" },
  { code: "ISO-07", kind: "AUTO", labelVi: "Master timeline", labelEn: "Master timeline" },
  { code: "ISO-08", kind: "AUTO", labelVi: "Check list thực hiện dự án", labelEn: "Project execution checklist" },
  { code: "ISO-09", kind: "MANUAL", labelVi: "Execution Plan", labelEn: "Execution plan" },
  { code: "ISO-10", kind: "MANUAL", optional: true, labelVi: "Hồ sơ đăng ký thi công", labelEn: "Construction registration file" },
  { code: "ISO-11", kind: "AUTO", labelVi: "Brief thiết kế", labelEn: "Design brief" },
  { code: "ISO-12", kind: "AUTO", labelVi: "Brief sản xuất", labelEn: "Production brief" },
  { code: "ISO-13", kind: "AUTO", labelVi: "Brief mua hàng", labelEn: "Purchasing brief" },
  { code: "ISO-14", kind: "AUTO", labelVi: "Brief Vận hành", labelEn: "Operations brief" },
  {
    code: "ISO-15",
    kind: "MANUAL",
    labelVi: "Báo giá NCC",
    labelEn: "Vendor quotations",
    hintVi: "Do Vận hành / Thu mua cung cấp.",
    hintEn: "Provided by Operations / Purchasing.",
  },
  { code: "ISO-16", kind: "MANUAL", labelVi: "Agenda", labelEn: "Agenda" },
  { code: "ISO-17", kind: "MANUAL", labelVi: "MC Script", labelEn: "MC script" },
  { code: "ISO-18", kind: "MANUAL", labelVi: "Layout, Rundown", labelEn: "Layout, rundown" },
  {
    code: "ISO-19",
    kind: "AUTO",
    optional: true,
    labelVi: "Thiết kế Final",
    labelEn: "Final design",
    hintVi: "Chỉ áp dụng cho dự án có hạng mục thiết kế.",
    hintEn: "Only applies to projects that include design work.",
  },
  { code: "ISO-20", kind: "MANUAL", labelVi: "Phiếu duyệt mẫu sản xuất", labelEn: "Production sample approval" },
  {
    code: "ISO-21",
    kind: "MANUAL",
    labelVi: "Bằng chứng thay đổi",
    labelEn: "Change evidence",
    hintVi: "Email, ảnh chụp màn hình tin nhắn… cho các bước: chỉnh sửa + duyệt Proposal; giá; thiết kế; duyệt master timeline; nghiệm thu.",
    hintEn: "Emails, message screenshots… for: proposal edits & approval; pricing; design; master timeline approval; acceptance.",
  },
  { code: "ISO-22", kind: "MANUAL", labelVi: "Hình ảnh chương trình / Báo cáo Report", labelEn: "Event photos / report" },
  { code: "ISO-23", kind: "AUTO", labelVi: "Hồ sơ thanh toán, nghiệm thu", labelEn: "Payment & acceptance file" },
  { code: "ISO-24", kind: "AUTO", labelVi: "CECO nghiệm thu", labelEn: "Liquidation cost sheet (CECO)" },
  { code: "ISO-25", kind: "MANUAL", labelVi: "Feedback của khách", labelEn: "Client feedback" },
];

export const ISO_DOC_CODES = ISO_DOCS.map((d) => d.code);

const BY_CODE = new Map(ISO_DOCS.map((d) => [d.code, d]));

export function isoDocDef(code: string): IsoDocDef | undefined {
  return BY_CODE.get(code);
}

/** Mã có nằm trong danh mục không — chốt ở mọi đường ghi, đừng tin `docCode` từ client. */
export function isIsoDocCode(code: string): boolean {
  return BY_CODE.has(code);
}
