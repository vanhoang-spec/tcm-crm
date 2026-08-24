/**
 * MẪU THƯ GỬI ỨNG VIÊN — hàm THUẦN, không chạm Prisma, không chạm mạng (TD-2b).
 *
 * Danh mục mẫu để Ở CODE (khuôn `quote-templates.ts` / `iso-catalog.ts`): mỗi mã ứng với MỘT chỗ
 * trong luồng tuyển dụng gọi nó và MỘT bộ biến thay thế riêng. Cho tạo mã tuỳ ý trong DB là đẻ ra
 * mẫu không có đường nào gửi. Nội dung (tiêu đề + thân thư) thì nằm ở DB, HR sửa không cần deploy.
 *
 * ⚠ Thân thư là VĂN BẢN THUẦN. Bộ gửi tự bọc thành HTML và tự thoát ký tự — nội dung do người dùng
 * gõ mà chèn thẳng vào HTML là mở đường tiêm mã vào hộp thư người ngoài công ty.
 */

export const RECRUIT_EMAIL_CODES = [
  "REJECT_SCREEN",
  "INTERVIEW_INVITE",
  "OFFER",
  "REJECT_FINAL",
  "ONBOARDING_NOTICE",
] as const;
export type RecruitEmailCode = (typeof RECRUIT_EMAIL_CODES)[number];

export function isRecruitEmailCode(v: string): v is RecruitEmailCode {
  return (RECRUIT_EMAIL_CODES as readonly string[]).includes(v);
}

export type EmailTemplateDef = {
  code: RecruitEmailCode;
  labelVi: string;
  labelEn: string;
  /** Ai nhận: ứng viên hay người trong công ty — quyết định ô "gửi tới" lấy từ đâu. */
  audience: "CANDIDATE" | "INTERNAL";
  /** Biến được phép dùng trong mẫu này. Biến ngoài danh sách sẽ bị báo ở bản xem trước. */
  vars: string[];
  defaultSubject: string;
  defaultBody: string;
};

/** Biến có ở MỌI mẫu. */
const COMMON_VARS = ["candidateName", "positionTitle", "companyName", "hrName"];

export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    code: "REJECT_SCREEN",
    labelVi: "Thư từ chối sau vòng hồ sơ",
    labelEn: "Rejection after CV screening",
    audience: "CANDIDATE",
    vars: COMMON_VARS,
    defaultSubject: "Thư phản hồi hồ sơ ứng tuyển vị trí {{positionTitle}} — {{companyName}}",
    defaultBody: `Kính gửi anh/chị {{candidateName}},

Cảm ơn anh/chị đã quan tâm và gửi hồ sơ ứng tuyển vị trí {{positionTitle}} tại {{companyName}}.

Sau khi xem xét kỹ hồ sơ, chúng tôi rất tiếc chưa thể mời anh/chị tham gia vòng phỏng vấn cho vị trí này ở thời điểm hiện tại.

Chúng tôi sẽ lưu hồ sơ của anh/chị và liên hệ lại khi có vị trí phù hợp hơn.

Chúc anh/chị nhiều sức khoẻ và sớm tìm được cơ hội như mong muốn.

Trân trọng,
{{hrName}}
Phòng Nhân sự — {{companyName}}`,
  },
  {
    code: "INTERVIEW_INVITE",
    labelVi: "Thư mời phỏng vấn",
    labelEn: "Interview invitation",
    audience: "CANDIDATE",
    vars: [...COMMON_VARS, "interviewRound", "interviewDate", "interviewTime", "interviewLocation", "interviewerName"],
    defaultSubject: "Thư mời phỏng vấn vị trí {{positionTitle}} — {{companyName}}",
    defaultBody: `Kính gửi anh/chị {{candidateName}},

Cảm ơn anh/chị đã ứng tuyển vị trí {{positionTitle}} tại {{companyName}}.

Chúng tôi trân trọng mời anh/chị tham gia buổi phỏng vấn vòng {{interviewRound}} với thông tin như sau:

- Thời gian: {{interviewTime}} ngày {{interviewDate}}
- Địa điểm: {{interviewLocation}}
- Người phỏng vấn: {{interviewerName}}

Anh/chị vui lòng phản hồi lại thư này để xác nhận lịch hẹn. Nếu thời gian trên chưa thuận tiện, anh/chị cho chúng tôi biết để sắp xếp lại.

Trân trọng,
{{hrName}}
Phòng Nhân sự — {{companyName}}`,
  },
  {
    code: "OFFER",
    labelVi: "Thư mời nhận việc (offer)",
    labelEn: "Job offer letter",
    audience: "CANDIDATE",
    vars: [...COMMON_VARS, "startDate", "departmentName"],
    defaultSubject: "Thư mời nhận việc vị trí {{positionTitle}} — {{companyName}}",
    defaultBody: `Kính gửi anh/chị {{candidateName}},

Thay mặt {{companyName}}, chúng tôi vui mừng thông báo anh/chị đã được lựa chọn cho vị trí {{positionTitle}} — {{departmentName}}.

Thư mời nhận việc kèm theo các điều khoản cụ thể được đính kèm trong thư này.

Anh/chị vui lòng phản hồi xác nhận trước ngày {{startDate}} để chúng tôi chuẩn bị thủ tục tiếp nhận.

Rất mong được chào đón anh/chị gia nhập đội ngũ.

Trân trọng,
{{hrName}}
Phòng Nhân sự — {{companyName}}`,
  },
  {
    code: "REJECT_FINAL",
    labelVi: "Thư từ chối sau phỏng vấn",
    labelEn: "Rejection after interview",
    audience: "CANDIDATE",
    vars: COMMON_VARS,
    defaultSubject: "Thư phản hồi kết quả phỏng vấn vị trí {{positionTitle}} — {{companyName}}",
    defaultBody: `Kính gửi anh/chị {{candidateName}},

Cảm ơn anh/chị đã dành thời gian tham gia buổi phỏng vấn vị trí {{positionTitle}} tại {{companyName}}.

Sau khi cân nhắc kỹ lưỡng, chúng tôi rất tiếc chưa thể đồng hành cùng anh/chị ở vị trí này trong đợt tuyển dụng lần này.

Chúng tôi thực sự trân trọng thời gian và sự quan tâm anh/chị đã dành cho {{companyName}}, và sẽ giữ liên hệ khi có vị trí phù hợp hơn.

Chúc anh/chị nhiều sức khoẻ và thành công.

Trân trọng,
{{hrName}}
Phòng Nhân sự — {{companyName}}`,
  },
  {
    code: "ONBOARDING_NOTICE",
    labelVi: "Báo trưởng bộ phận chuẩn bị onboarding",
    labelEn: "Onboarding notice to department head",
    audience: "INTERNAL",
    vars: [...COMMON_VARS, "startDate", "departmentName", "managerName"],
    defaultSubject: "[Onboarding] {{candidateName}} — {{positionTitle}} nhận việc ngày {{startDate}}",
    defaultBody: `Kính gửi anh/chị {{managerName}},

Ứng viên {{candidateName}} đã xác nhận nhận việc vị trí {{positionTitle}} — {{departmentName}}.

Ngày đi làm đầu tiên: {{startDate}}

Nhờ anh/chị chuẩn bị trước cho ngày nhận việc:
- Chỗ ngồi, máy tính, tài khoản làm việc
- Kế hoạch onboarding tuần đầu và người kèm cặp
- Bàn giao đầu việc dự kiến

Trân trọng,
{{hrName}}
Phòng Nhân sự — {{companyName}}`,
  },
];

export function emailTemplateDef(code: string): EmailTemplateDef | null {
  return EMAIL_TEMPLATES.find((t) => t.code === code) ?? null;
}

/**
 * Hai mẫu thư thuộc KHÂU OFFER — đòi `recruit.offer.manage` (chỉ Senior HR Manager), KHÔNG phải
 * `recruit.email.send` như ba mẫu còn lại.
 *
 * Quyết định chủ dự án 24/08/2026: nhân sự hành chính gửi được thư hẹn lịch và thư từ chối, nhưng
 * thư mời nhận việc thì "chỉ Senior HR Manager review để sửa cuối cùng và gửi đi".
 * `ONBOARDING_NOTICE` đi cùng nhóm vì nó chỉ phát sinh SAU KHI ứng viên nhận offer — nó là bước
 * cuối của chính khâu đó, và nó công bố một quyết định tuyển dụng ra cho trưởng bộ phận.
 *
 * ⚠ Đây là danh sách CHO PHÉP NGƯỢC: thêm mẫu thư mới mà quên khai ở đây thì nó rơi vào nhóm
 * `recruit.email.send` (rộng hơn). Thêm mẫu nào thuộc khâu offer thì phải thêm vào đây.
 */
export const OFFER_STAGE_TEMPLATES: readonly string[] = ["OFFER", "ONBOARDING_NOTICE"];

export function isOfferStageTemplate(code: string): boolean {
  return OFFER_STAGE_TEMPLATES.includes(code);
}

const VAR_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export type RenderResult = {
  text: string;
  /** Biến trong mẫu mà lần gửi này KHÔNG có giá trị — bản xem trước phải cảnh báo. */
  missing: string[];
  /** Biến trong mẫu KHÔNG thuộc danh sách cho phép của mã đó — gõ sai tên biến. */
  unknown: string[];
};

/**
 * Thay {{bien}} bằng giá trị.
 *
 * ⚠ Biến THIẾU thì GIỮ NGUYÊN `{{ten}}` trong kết quả chứ KHÔNG thay bằng chuỗi rỗng: chuỗi rỗng
 * cho ra câu "Kính gửi anh/chị ," trông vẫn bình thường và sẽ được gửi đi. Giữ nguyên dấu ngoặc thì
 * bản xem trước nhìn phát thấy ngay, và bộ gửi có cớ để CHẶN.
 */
export function renderTemplate(text: string, vars: Record<string, string | null | undefined>, allowed?: string[]): RenderResult {
  const missing: string[] = [];
  const unknown: string[] = [];
  const out = text.replace(VAR_RE, (whole, name: string) => {
    if (allowed && !allowed.includes(name)) {
      if (!unknown.includes(name)) unknown.push(name);
      return whole;
    }
    const v = vars[name];
    if (v === null || v === undefined || String(v).trim() === "") {
      if (!missing.includes(name)) missing.push(name);
      return whole;
    }
    return String(v);
  });
  return { text: out, missing, unknown };
}

/** Còn `{{...}}` trong nội dung ⇒ CHẶN gửi. Đây là chốt chặn cuối, không phải cảnh báo. */
export function hasUnresolvedVars(text: string): boolean {
  VAR_RE.lastIndex = 0;
  return VAR_RE.test(text);
}

/**
 * Kiểm địa chỉ nhận. CỐ Ý đơn giản: chỉ chặn thứ chắc chắn sai (rỗng, thiếu @, có khoảng trắng).
 * Regex email "đầy đủ" nổi tiếng là chặn nhầm địa chỉ hợp lệ — và ở đây gửi hỏng thì Resend báo lại,
 * còn chặn nhầm thì HR không gửi được cho một ứng viên có thật.
 */
export function isSendableEmail(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  if (!s || /\s/.test(s)) return false;
  const at = s.indexOf("@");
  return at > 0 && at < s.length - 1 && s.includes(".", at);
}

/** Bọc văn bản thuần thành HTML an toàn — thoát ký tự rồi mới xuống dòng. */
export function textToSafeHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111">${esc.replace(/\n/g, "<br>")}</div>`;
}
