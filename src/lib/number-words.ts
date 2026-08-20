/**
 * Đọc số tiền VND thành chữ tiếng Việt — hàm THUẦN.
 *
 * Vì sao cần: 23/23 file báo giá NCC thật đều có dòng "Bằng chữ: …" dưới tổng thanh toán, và hợp
 * đồng bắt buộc phải có. Repo chưa có hàm này (đã grep) nên viết mới, đặt riêng một file để cả bộ
 * xuất báo giá lẫn bộ sinh hợp đồng dùng chung.
 *
 * Chỉ làm tiếng Việt: đây là chứng từ pháp lý ký ở Việt Nam, bản tiếng Anh không dùng "bằng chữ".
 */

const ONES = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
/** Đủ tới triệu tỷ — quá xa so với mọi khoản chi của app (lớn nhất đang có ~16 tỷ). */
const SCALES = ["", " nghìn", " triệu", " tỷ", " nghìn tỷ", " triệu tỷ"];

/**
 * Đọc một nhóm 3 chữ số.
 * `full` = phải đọc cả hàng trăm dù bằng 0 (vì còn nhóm lớn hơn đứng trước) — nhờ vậy 1.000.050 ra
 * "một triệu không trăm năm mươi" chứ không phải "một triệu năm mươi".
 */
function readGroup(n: number, full: boolean): string {
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const units = n % 10;
  const parts: string[] = [];

  if (hundreds > 0 || full) parts.push(`${ONES[hundreds]} trăm`);

  if (tens > 1) {
    parts.push(`${ONES[tens]} mươi`);
    if (units === 1) parts.push("mốt");
    else if (units === 5) parts.push("lăm");
    else if (units > 0) parts.push(ONES[units]);
  } else if (tens === 1) {
    parts.push("mười");
    if (units === 5) parts.push("lăm");
    else if (units > 0) parts.push(ONES[units]);
  } else if (units > 0) {
    if (hundreds > 0 || full) parts.push("lẻ");
    parts.push(ONES[units]);
  }
  return parts.join(" ");
}

/** vd 12.916.800 → "Mười hai triệu chín trăm mười sáu nghìn tám trăm đồng". Làm tròn về số nguyên đồng. */
export function amountInWordsVi(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const negative = amount < 0;
  const n = Math.round(Math.abs(amount));
  if (n === 0) return "Không đồng";

  const groups: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  if (groups.length > SCALES.length) return "";

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    parts.push(readGroup(groups[i], i < groups.length - 1) + SCALES[i]);
  }

  const body = parts.join(" ").replace(/\s+/g, " ").trim();
  const cased = negative ? `Âm ${body}` : body.charAt(0).toUpperCase() + body.slice(1);
  return `${cased} đồng`;
}
