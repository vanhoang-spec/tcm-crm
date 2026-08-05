// CE-3 — DANH MỤC MẪU BÁO GIÁ gửi khách. Để ở CODE theo đúng khuôn `permission-catalog.ts` và
// `iso-catalog.ts`: mỗi mã ứng với một cách TRÌNH BÀY có thật trong bộ xuất, thêm dòng vào DB sẽ
// tạo ra mẫu không ai render được.
//
// `Client.quoteTemplateCode` trỏ vào đây (null = dùng mẫu mặc định BM02). Route xuất nhận
// `?template=` để xem thử mẫu khác mà không phải đổi hồ sơ khách.

export type QuoteTemplateCode = "BM02" | "COMPACT";

export type QuoteTemplate = {
  code: QuoteTemplateCode;
  labelVi: string;
  labelEn: string;
  /** Cột hiện trên bản khách, theo thứ tự. Bộ xuất map từ đây, không hardcode ở chỗ khác. */
  columns: QuoteColumn[];
  /** Khối kiểm soát biểu mẫu ISO ở góc phải (BM02 là số hiệu form thật gửi khách). */
  iso: { formNo: string; issuedDate: string; revision: string; pages: string } | null;
  /** In điều khoản + chữ ký cuối bản. Mẫu rút gọn bỏ để vừa một trang. */
  showTerms: boolean;
};

/** Cột của bản khách — `key` khớp trường trong QuotationRow (kind="line"). */
export type QuoteColumn = { key: "stt" | "name" | "specs" | "qty" | "unit" | "unitPrice" | "total" | "note"; label: string; width: number };

const BM02_COLUMNS: QuoteColumn[] = [
  { key: "stt", label: "STT", width: 6 },
  { key: "name", label: "Hạng mục", width: 34 },
  { key: "specs", label: "Mô tả", width: 40 },
  { key: "qty", label: "Khối lượng", width: 11 },
  { key: "unit", label: "Đơn vị", width: 12 },
  { key: "unitPrice", label: "Đơn giá", width: 15 },
  { key: "total", label: "Thành tiền", width: 17 },
  { key: "note", label: "Ghi chú", width: 20 },
];

/** Rút gọn: bỏ Mô tả + Ghi chú — dùng khi khách chỉ muốn xem hạng mục và tiền. */
const COMPACT_COLUMNS: QuoteColumn[] = BM02_COLUMNS.filter((c) => c.key !== "specs" && c.key !== "note");

export const QUOTE_TEMPLATES: QuoteTemplate[] = [
  {
    code: "BM02",
    labelVi: "BM02 — báo giá TCM (mặc định)",
    labelEn: "BM02 — TCM quotation (default)",
    columns: BM02_COLUMNS,
    iso: { formNo: "BM02/QT.TCM.15", issuedDate: "01/06/2024", revision: "01/00", pages: "1" },
    showTerms: true,
  },
  {
    code: "COMPACT",
    labelVi: "Rút gọn — chỉ hạng mục & tiền",
    labelEn: "Compact — items & amounts only",
    columns: COMPACT_COLUMNS,
    iso: null,
    showTerms: false,
  },
];

export const DEFAULT_QUOTE_TEMPLATE: QuoteTemplateCode = "BM02";

export function resolveQuoteTemplate(code: string | null | undefined): QuoteTemplate {
  return QUOTE_TEMPLATES.find((t) => t.code === code) ?? QUOTE_TEMPLATES[0];
}

/** Hai bố cục file Excel: tất cả trong một sheet, hoặc mỗi mục L1 một sheet + sheet TỔNG HỢP. */
export type QuoteLayout = "single" | "multi";

export function resolveQuoteLayout(v: string | null | undefined): QuoteLayout {
  return v === "multi" ? "multi" : "single";
}
