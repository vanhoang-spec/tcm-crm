// Tuyển dụng — trích xuất thông tin cơ bản từ CV, phần THUẦN: không Prisma, không `fs`, không AI.
//
// ⚠ VÌ SAO KHÔNG DÙNG AI Ở BƯỚC NÀY (quyết định 24/08/2026): tải lên 10 CV mà tự gọi AI là 10 lượt
// tính tiền diễn ra SAU LƯNG người dùng. Cả repo đang theo luật ngược lại — `recruit.ai_parse`,
// `mkt.generate`, `clients.kb.generate` đều tách riêng đúng vì "AI tính tiền theo LƯỢT" và phải do
// người BẤM. Ba trường ở đây (tên · email · điện thoại) là thứ regex làm được gần như tuyệt đối với
// email/điện thoại, và làm được tốt với tên. Nút "AI đọc CV" vẫn còn nguyên cho phần sâu hơn
// (tóm tắt kinh nghiệm, kỹ năng, lương mong muốn).

/** Email đầu tiên trong CV. Đủ chặt để không nuốt dấu câu dính liền, đủ rộng cho tên miền thật. */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;

/**
 * Số điện thoại Việt Nam. Chấp nhận `0912345678`, `+84 912 345 678`, `84-912.345.678`,
 * `(028) 3822 1234`. KHÔNG chấp nhận chuỗi số dài hơn (số tài khoản, CCCD) — chốt bằng ranh giới.
 *
 * ⚠ Dấu tách là DẤU CÁCH THƯỜNG, KHÔNG dùng `\s`: nó gồm cả XUỐNG DÒNG, nên số ở cuối dòng nuốt
 * luôn chữ số đầu dòng SAU. Đo được trên CV thật: "0912 345 678" + dòng kế bắt đầu bằng "5 nam..."
 * cho ra "09123456785" — 11 chữ số nên trông vẫn hợp lệ và lọt qua mọi chốt chặn, sai THẦM LẶNG.
 */
const PHONE_RE = /(?<!\d)(?:(?:\+?84)|0)(?:[ .\-()]{0,2}\d){8,10}(?!\d)/g;

/** Từ hay đứng cạnh tên trong tên file / dòng đầu CV — bỏ đi thì còn lại đúng cái tên. */
const NOISE_WORDS = [
  "cv", "curriculum", "vitae", "resume", "hoso", "ho so", "profile", "portfolio", "ung tuyen",
  "application", "final", "new", "update", "updated", "moi", "copy", "ban sao",
];

/** Nhãn chức danh hay bị nhầm là tên khi đứng ở dòng đầu. */
const TITLE_HINTS = [
  "account", "designer", "design", "manager", "executive", "director", "staff", "intern",
  "senior", "junior", "leader", "supervisor", "assistant", "officer", "specialist",
  "developer", "marketing", "sales", "hr", "nhan vien", "truong phong", "chuyen vien",
];

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

/**
 * Chuẩn hoá số điện thoại về dạng gọi được: bỏ mọi ký tự phân cách, `+84`/`84` → `0`.
 * ⚠ Chỉ nhận lại khi ra ĐÚNG 10 số bắt đầu bằng 0 (di động + cố định VN hiện hành). Số 11 chữ số
 * là đầu số cũ đã bỏ từ 2018 hoặc là chuỗi số khác lọt vào — trả null còn hơn điền số sai.
 */
export function normalizeVnPhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+84")) d = "0" + d.slice(3);
  else if (d.startsWith("84") && d.length >= 11) d = "0" + d.slice(2);
  d = d.replace(/\D/g, "");
  // 10 số = di động; 11 số = cố định (0 + mã vùng 2-3 số + 7-8 số, vd 028 3822 1234).
  // Dài hơn là số tài khoản / CCCD lọt vào — trả null còn hơn điền số sai vào hồ sơ.
  if (d.length < 10 || d.length > 11 || !d.startsWith("0")) return null;
  return d;
}

export function findEmail(text: string): string | null {
  const m = text.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

export function findPhone(text: string): string | null {
  for (const m of text.match(PHONE_RE) ?? []) {
    const norm = normalizeVnPhone(m);
    if (norm) return norm;
  }
  return null;
}

/**
 * Tên rút từ TÊN FILE — trong thực tế đây là nguồn đáng tin nhất: người ta gần như luôn đặt tên file
 * theo kiểu `CV - ĐỖ THANH HOÀNG.pdf`, `Nguyen Van A_Resume.docx`, `CV_Account Manager_Tran Thu Ha.pdf`.
 * Bỏ đuôi, bỏ các từ nhiễu và nhãn chức danh, còn lại là tên.
 */
export function nameFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  // Tách theo mọi dấu phân cách hay dùng, rồi chọn MẢNH trông giống tên người nhất.
  const parts = base.split(/[_\-–—|/,()[\]{}]+/).map((p) => p.trim()).filter(Boolean);
  const candidates = parts.filter((p) => {
    const flat = stripAccents(p).toLowerCase().trim();
    if (!flat) return false;
    if (/\d/.test(flat)) return false;
    if (NOISE_WORDS.includes(flat)) return false;
    if (TITLE_HINTS.some((h) => flat === h || flat.startsWith(h + " ") || flat.endsWith(" " + h))) return false;
    const words = flat.split(/\s+/);
    return words.length >= 2 && words.length <= 7 && /^[a-z ]+$/.test(flat);
  });
  if (candidates.length === 0) return null;
  // Nhiều mảnh hợp lệ thì lấy mảnh DÀI NHẤT — `CV_Account_Nguyen Van A` cho ra "Nguyen Van A".
  return tidyName(candidates.sort((a, b) => b.length - a.length)[0]);
}

/**
 * Tên rút từ NỘI DUNG CV: quét vài dòng đầu, lấy dòng trông giống họ tên nhất.
 * CV thật gần như luôn đặt tên ở đầu trang, thường IN HOA hoặc cỡ chữ lớn (mất khi bóc text, nên
 * chỉ còn dựa vào vị trí + hình dạng chuỗi).
 */
export function nameFromText(text: string): string | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 12);
  for (const line of lines) {
    if (line.length > 60) continue;
    if (/[@\d]/.test(line)) continue;
    const flat = stripAccents(line).toLowerCase();
    // ⚠ So theo TỪNG TỪ, không so cả dòng: "CURRICULUM VITAE" gồm hai từ nhiễu nhưng cả cụm
    // lại không nằm trong danh sách, nên cách so cả dòng để lọt nguyên tiêu đề CV thành "tên".
    if (flat.split(/\s+/).every((w) => NOISE_WORDS.includes(w))) continue;
    if (TITLE_HINTS.some((h) => flat.includes(h))) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 7) continue;
    // Chỉ chữ cái (có dấu) và khoảng trắng — loại dòng địa chỉ, tiêu đề mục, ký hiệu.
    if (!/^[\p{L} ]+$/u.test(line)) continue;
    return tidyName(line);
  }
  return null;
}

/** Chuẩn hoá cách viết hoa: `NGUYEN VAN A` và `nguyen van a` đều thành `Nguyen Van A`. */
export function tidyName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toLocaleUpperCase("vi") + w.slice(1).toLocaleLowerCase("vi"))
    .join(" ")
    .slice(0, 120);
}

export type GuessedCandidate = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  /** Nguồn của TÊN, để giao diện nói thật với HR là tên này lấy từ đâu mà ra. */
  nameSource: "text" | "filename" | null;
};

/**
 * Rà một CV và đoán ba trường cơ bản.
 *
 * ⚠ Thứ tự ưu tiên cho TÊN: nội dung CV TRƯỚC, tên file SAU. Nội dung là thứ ứng viên tự viết; tên
 * file có thể do HR đặt lại hoặc do hệ thống mail cắt ngắn. Nhưng tên file vẫn phải có mặt vì CV
 * xuất từ Canva/Figma thường không có lớp chữ nào để đọc.
 *
 * ⚠ KHÔNG BAO GIỜ trả về chuỗi rỗng — trả `null` để chỗ gọi biết là "không đoán được" và còn hỏi
 * người dùng, thay vì lưu một cái tên rỗng rồi HR không thấy gì mà sửa.
 */
export function guessCandidateInfo(text: string, fileName: string): GuessedCandidate {
  const fromText = text.trim() ? nameFromText(text) : null;
  const fromFile = nameFromFileName(fileName);
  return {
    fullName: fromText ?? fromFile,
    email: text.trim() ? findEmail(text) : null,
    phone: text.trim() ? findPhone(text) : null,
    nameSource: fromText ? "text" : fromFile ? "filename" : null,
  };
}
