/**
 * Tìm nhân sự "thông minh" — phần THUẦN (không IO).
 *
 * Vì sao lọc bằng JS chứ không đẩy xuống SQL: bảng nhân sự chỉ ~40 dòng, mà yêu cầu là gõ KHÔNG DẤU
 * vẫn ra ("hoang" → "HỒ HỒNG PHƯỚC"? không; "hoang" → "NGUYỄN VĂN HOÀNG" có). SQLite `LIKE` chỉ
 * không phân biệt hoa/thường với ASCII và KHÔNG bỏ được dấu tiếng Việt, nên muốn làm ở SQL thì phải
 * thêm cột chuẩn hoá + migration + đường ghi. Với 40 dòng thì lọc trong bộ nhớ rẻ hơn nhiều.
 */

/** bỏ dấu + thường hoá; đ/Đ → d (mượn đúng cách làm của lib/clients-import.ts). */
export function foldSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/** Các trường một nhân sự có thể được tìm thấy qua. */
export type StaffSearchable = {
  fullName: string;
  email: string;
  phone?: string | null;
  code?: string | null;
  title?: string | null;
  departmentName?: string | null;
  teamName?: string | null;
  teamCode?: string | null;
  roleName?: string | null;
};

/**
 * Khớp ở ĐẦU TỪ, không phải bất kỳ vị trí nào.
 *
 * ⚠ Lý do: tên tiếng Việt khiến khớp-bất-kỳ-vị-trí nhiễu nặng — "yen" nằm trong "NGUYỄN" nên gõ "yen"
 * ra 18/36 người (đo trên dev.db) thay vì mấy người tên Yến. Khớp đầu từ vẫn giữ nguyên các ca thật:
 * "hoang" → "NGUYỄN HOÀNG HIỆP", "ceo" → "Chief Executive Officer (CEO)", "tthyen" → email.
 */
function startsWord(hay: string, token: string): boolean {
  let i = hay.indexOf(token);
  while (i >= 0) {
    if (i === 0 || !/[a-z0-9]/.test(hay[i - 1])) return true;
    i = hay.indexOf(token, i + 1);
  }
  return false;
}

/**
 * Khớp khi MỌI từ khoá đều xuất hiện ở đâu đó trong hồ sơ (AND theo từ, OR theo trường).
 * Nhờ vậy "hoang ke toan" tìm được người tên Hoàng thuộc phòng Kế toán — thứ mà tìm một-ô-một-trường
 * không làm được.
 */
export function matchesStaffQuery(s: StaffSearchable, query: string): boolean {
  const q = foldSearch(query);
  if (!q) return true;
  const hay = foldSearch(
    // ⚠ CỐ Ý không gộp tên QUẢN LÝ TRỰC TIẾP vào đây: 8/36 người cùng một quản lý, gõ tên sếp là ra
    // nguyên cấp dưới (đo được: "hoang" ra 15/36 người). Muốn xem theo sếp thì đó là bộ lọc riêng.
    [s.fullName, s.email, s.phone, s.code, s.title, s.departmentName, s.teamName, s.teamCode, s.roleName]
      .filter(Boolean)
      .join(" "),
  );
  // Số điện thoại người dùng hay gõ liền hoặc có dấu chấm/khoảng trắng — so thêm bản đã bỏ ký tự phân cách.
  const digitsHay = hay.replace(/[^0-9]/g, "");
  return q.split(/\s+/).every((token) => {
    if (startsWord(hay, token)) return true;
    const digits = token.replace(/[^0-9]/g, "");
    return digits.length >= 3 && digitsHay.includes(digits);
  });
}
