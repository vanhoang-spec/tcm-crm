// Sinh file lịch chuẩn iCalendar (RFC 5545) — hàm THUẦN, không Prisma, không fs.
//
// Vì sao có file này thay vì nối thẳng Google Calendar API (quyết định chủ dự án 06/08/2026):
// nối API đòi lập tài khoản Google Cloud cho công ty, xin duyệt ứng dụng, và mỗi nhân sự phải cấp
// quyền một lần — token hết hạn là lịch hỏng âm thầm. File .ics thì mở ra bằng gì cũng được
// (Google Calendar, Outlook, lịch điện thoại) và chạy được NGAY, không phụ thuộc dịch vụ ngoài.
//
// ⚠ Đường gửi thư mời họp qua email CỐ Ý chưa làm: máy chủ mail của công ty hiện chưa được khai
// báo trên production (toàn bộ biến SMTP_* đang trống, đó cũng là lý do "Quên mật khẩu" chưa gửi
// được thư). Khi nào khai báo xong thì đính chính chuỗi do hàm này sinh ra vào email là đủ —
// KHÔNG cần viết lại gì ở đây.

/**
 * Thoát ký tự cho giá trị thuộc tính iCalendar (RFC 5545 §3.3.11).
 * Thứ tự quan trọng: phải thoát dấu `\` TRƯỚC, không thì các lần thoát sau bị thoát chồng.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * Gấp dòng dài theo RFC 5545 §3.1: mỗi dòng tối đa 75 OCTET, dòng tiếp theo bắt đầu bằng một
 * khoảng trắng.
 *
 * ⚠ Đếm theo OCTET chứ không phải KÝ TỰ — tên ứng viên tiếng Việt có dấu là 2–3 octet mỗi chữ,
 * đếm theo ký tự sẽ sinh dòng vượt chuẩn. Và không được cắt GIỮA một ký tự nhiều octet, nếu không
 * file mở ra bị vỡ chữ.
 */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;
  let limit = 75; // dòng đầu 75 octet; các dòng sau chừa 1 octet cho khoảng trắng dẫn đầu
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Lùi về đầu ký tự UTF-8 gần nhất (byte tiếp theo không được là byte nối 10xxxxxx).
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74;
  }
  return parts.join("\r\n ");
}

/** Mốc thời gian dạng UTC của iCalendar: 20260812T093000Z. */
export function icsStamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

export type IcsEvent = {
  /** Định danh bất biến của sự kiện — mở lại file cùng uid thì lịch CẬP NHẬT chứ không nhân đôi. */
  uid: string;
  start: Date;
  /** Thời lượng phút. Kết thúc = start + durationMin. */
  durationMin: number;
  summary: string;
  description?: string;
  location?: string;
  /** Mốc sinh file. Truyền vào từ ngoài để hàm giữ tính THUẦN (test được, không đọc đồng hồ). */
  stamp: Date;
};

/**
 * Dựng nội dung file .ics cho MỘT sự kiện.
 *
 * METHOD:PUBLISH chứ không REQUEST: đây là file để người dùng TỰ thêm vào lịch của mình, không
 * phải thư mời gửi từ một địa chỉ tổ chức. Dùng REQUEST mà không có ORGANIZER là email thật thì
 * một số ứng dụng lịch sẽ báo lỗi hoặc hiện nút "Trả lời" không dẫn tới đâu.
 */
export function buildIcs(event: IcsEvent): string {
  const end = new Date(event.start.getTime() + event.durationMin * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TCM CRM//Recruitment//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${icsStamp(event.stamp)}`,
    `DTSTART:${icsStamp(event.start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  // RFC 5545 đòi kết thúc dòng bằng CRLF, kể cả dòng cuối.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * Tên file gợi ý khi tải về. Bỏ hết ký tự mà Windows/macOS cấm trong tên file, và bỏ dấu tiếng
 * Việt để tên file không bị vỡ trên máy dùng bảng mã khác.
 */
export function icsFilename(base: string): string {
  const ascii = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${ascii || "interview"}.ics`;
}
