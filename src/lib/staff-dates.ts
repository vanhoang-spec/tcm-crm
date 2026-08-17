// Ngày sinh + ngày đi làm đầu tiên của nhân sự — bộ parse "DD/MM/YYYY" dùng chung cho form HR
// (settings/staff) và form tự bổ sung ở Hồ sơ cá nhân (profile). File THUẦN, không prisma.
//
// ⚠ Hai cột này lưu theo LOCAL midnight (`new Date(y, m, d)`) từ trước — khác quy ước UTC-midnight
// của các cột ngày nghiệp vụ (HANDOVER 4.3). Giữ nguyên để nhất quán với dữ liệu đã có: mọi chỗ đọc
// (`occasions.ts` sinh nhật/thâm niên, `timekeeping.ts` phép năm) đều so bằng thành phần địa phương.

const DMY_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function parseDmy(input: string): Date | null {
  const m = DMY_REGEX.exec(input.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null; // chặn ngày ảo VD 31/02
  if (year < 1940) return null; // chặn giá trị phi thực tế
  return d;
}

/** Parse "DD/MM/YYYY" → Date, trả null nếu sai định dạng/ngày không hợp lệ/ở tương lai. */
export function parseDob(input: string): Date | null {
  const d = parseDmy(input);
  if (!d) return null;
  if (d.getTime() > Date.now()) return null; // không cho ngày sinh ở tương lai
  return d;
}

/**
 * Parse "DD/MM/YYYY" cho ngày đi làm đầu tiên → Date, trả null nếu sai định dạng/ngày không hợp lệ.
 * KHÔNG chặn tương lai (khác parseDob) — HR có thể tạo tài khoản CRM trước ngày nhân sự thật sự bắt đầu làm.
 */
export function parseFirstWorkDate(input: string): Date | null {
  return parseDmy(input);
}
