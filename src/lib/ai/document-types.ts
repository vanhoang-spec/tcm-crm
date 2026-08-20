/**
 * DANH MỤC LOẠI VĂN BẢN nội bộ TCM cho công cụ "Soạn thảo văn bản" ở `/ai`.
 *
 * Để ở CODE theo đúng khuôn `quote-templates.ts` / `iso-catalog.ts`: mỗi mã đi kèm một BỐ CỤC có
 * thật đưa vào prompt. Thêm dòng vào DB sẽ đẻ ra loại văn bản không có bố cục nào — model tự bịa
 * cấu trúc, mỗi lần một kiểu.
 *
 * `outline` là thứ quyết định chất lượng bản soạn: không có nó thì model trả về một bài văn xuôi
 * đúng nội dung nhưng sai khuôn văn bản hành chính (thiếu "Nơi nhận", thiếu căn cứ, thiếu chỗ ký).
 *
 * File THUẦN: client component (ô chọn loại văn bản) import được.
 */

export type DocumentTypeCode =
  | "DECISION"
  | "ANNOUNCEMENT"
  | "OFFICIAL_LETTER"
  | "PROPOSAL"
  | "MINUTES"
  | "REGULATION"
  | "HR_LETTER"
  | "FINANCE_MEMO"
  | "OTHER";

export type DocumentType = {
  code: DocumentTypeCode;
  labelVi: string;
  labelEn: string;
  /** Gợi ý ngắn hiện dưới ô chọn — cho người dùng biết chọn đúng loại. */
  hintVi: string;
  hintEn: string;
  /** Bố cục chuẩn, đưa thẳng vào prompt. */
  outline: string[];
};

export const DOCUMENT_TYPES: DocumentType[] = [
  {
    code: "DECISION",
    labelVi: "Quyết định",
    labelEn: "Decision",
    hintVi: "Bổ nhiệm, điều chuyển, khen thưởng, kỷ luật, ban hành quy định",
    hintEn: "Appointment, transfer, commendation, discipline, issuing a regulation",
    outline: [
      "Tên loại văn bản + trích yếu (VỀ VIỆC ...)",
      "Căn cứ ban hành (điều lệ công ty, quy chế nội bộ, đề nghị của phòng ban) — chỉ nêu căn cứ NGƯỜI DÙNG đã cung cấp",
      "Các điều khoản đánh số: Điều 1 nội dung quyết định · Điều 2 hiệu lực · Điều 3 trách nhiệm thi hành",
      "Nơi nhận",
      "Chỗ ký: chức danh người ký (bỏ trống tên nếu người dùng không nêu)",
    ],
  },
  {
    code: "ANNOUNCEMENT",
    labelVi: "Thông báo nội bộ",
    labelEn: "Internal announcement",
    hintVi: "Lịch nghỉ lễ, thay đổi quy trình, nhắc việc toàn công ty",
    hintEn: "Holiday schedule, process change, company-wide reminder",
    outline: [
      "Tên loại văn bản + trích yếu",
      "Đoạn mở: lý do/căn cứ thông báo",
      "Nội dung thông báo (gạch đầu dòng hoặc đánh số nếu nhiều mục)",
      "Thời điểm áp dụng và đầu mối liên hệ khi cần hỏi thêm",
      "Nơi nhận + chỗ ký",
    ],
  },
  {
    code: "OFFICIAL_LETTER",
    labelVi: "Công văn gửi ra ngoài",
    labelEn: "Official letter",
    hintVi: "Gửi khách hàng, nhà cung cấp, cơ quan quản lý",
    hintEn: "To a client, vendor or authority",
    outline: [
      "Kính gửi: (tên đơn vị nhận)",
      "Trích yếu: về việc ...",
      "Đoạn mở: bối cảnh và lý do gửi công văn",
      "Nội dung đề nghị/trao đổi, tách ý rõ ràng",
      "Đề nghị cụ thể + mốc thời gian mong nhận phản hồi",
      "Lời cảm ơn + chỗ ký",
    ],
  },
  {
    code: "PROPOSAL",
    labelVi: "Tờ trình / Đề xuất",
    labelEn: "Proposal / request for approval",
    hintVi: "Trình BGĐ duyệt chi, duyệt nhân sự, duyệt phương án",
    hintEn: "For management approval: spend, headcount, plan",
    outline: [
      "Kính gửi + trích yếu",
      "Hiện trạng và lý do đề xuất",
      "Nội dung đề xuất (phương án, số lượng, chi phí — DÙNG BẢNG nếu có số)",
      "Phân tích lợi ích / rủi ro nếu không làm",
      "Kiến nghị cụ thể cần phê duyệt",
      "Chỗ ký người trình",
    ],
  },
  {
    code: "MINUTES",
    labelVi: "Biên bản",
    labelEn: "Minutes / record",
    hintVi: "Biên bản họp, bàn giao, kiểm kê, sự việc",
    hintEn: "Meeting, handover, stock-take, incident",
    outline: [
      "Tên loại văn bản + trích yếu",
      "Thời gian, địa điểm",
      "Thành phần tham dự (bên A / bên B nếu là bàn giao)",
      "Nội dung diễn biến hoặc danh mục bàn giao (DÙNG BẢNG nếu là danh mục)",
      "Kết luận / cam kết của các bên",
      "Biên bản lập thành mấy bản, mỗi bên giữ mấy bản + chỗ ký các bên",
    ],
  },
  {
    code: "REGULATION",
    labelVi: "Quy định / Quy chế nội bộ",
    labelEn: "Internal policy",
    hintVi: "Quy chế chấm công, quy định sử dụng tài sản, quy trình phối hợp",
    hintEn: "Timekeeping policy, asset use rules, coordination process",
    outline: [
      "Tên quy định + phạm vi áp dụng và đối tượng áp dụng",
      "Giải thích từ ngữ (nếu có thuật ngữ riêng)",
      "Các điều khoản đánh số theo chương/điều",
      "Trách nhiệm thi hành và chế tài khi vi phạm",
      "Hiệu lực thi hành + chỗ ký",
    ],
  },
  {
    code: "HR_LETTER",
    labelVi: "Văn bản nhân sự",
    labelEn: "HR letter",
    hintVi: "Thư mời nhận việc, xác nhận công tác, nhắc nhở, thư cảm ơn",
    hintEn: "Offer letter, employment confirmation, reminder, thank-you note",
    outline: [
      "Kính gửi: (tên người nhận, chức danh)",
      "Trích yếu",
      "Nội dung chính, nêu rõ mốc thời gian và điều kiện kèm theo nếu có",
      "Việc người nhận cần làm tiếp theo và hạn phản hồi",
      "Chỗ ký đại diện công ty",
    ],
  },
  {
    code: "FINANCE_MEMO",
    labelVi: "Văn bản kế toán",
    labelEn: "Accounting memo",
    hintVi: "Giải trình chi phí, đối chiếu công nợ, đề nghị thanh toán, nhắc nợ",
    hintEn: "Cost explanation, debt reconciliation, payment request, dunning letter",
    outline: [
      "Kính gửi + trích yếu",
      "Căn cứ chứng từ (hợp đồng, hoá đơn, biên bản nghiệm thu — chỉ nêu thứ người dùng cung cấp)",
      "BẢNG số liệu: nội dung · số tiền · ghi chú (bắt buộc dùng bảng khi có từ 2 khoản trở lên)",
      "Đề nghị cụ thể + hạn xử lý",
      "Chỗ ký",
    ],
  },
  {
    code: "OTHER",
    labelVi: "Khác",
    labelEn: "Other",
    hintVi: "Loại chưa có trong danh sách — mô tả rõ ở phần nội dung",
    hintEn: "Not listed above — describe it in the content field",
    outline: ["Tự chọn bố cục hợp lý theo mô tả của người dùng, vẫn phải có trích yếu và chỗ ký"],
  },
];

export function resolveDocumentType(code: string | null | undefined): DocumentType | null {
  return DOCUMENT_TYPES.find((d) => d.code === code) ?? null;
}

/** Trần ký tự ô "nội dung chính" — đủ cho một brief dài, chặn dán nhầm cả tệp vào ô nhập. */
export const MAX_DOCUMENT_BRIEF = 8000;
/** Trần text bóc từ file mẫu tham chiếu gửi sang DeepSeek. */
export const MAX_DOCUMENT_REF_CHARS = 20000;
