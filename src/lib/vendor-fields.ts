// PUR-2 — TRƯỜNG TUỲ CHỈNH của hồ sơ NCC. File THUẦN (không prisma) — form client và action server
// dùng chung để hai bên không lệch nhau về kiểu/khoá.

export const VENDOR_FIELD_TYPES = ["TEXT", "TEXTAREA", "NUMBER", "DATE", "SELECT", "BOOL"] as const;
export type VendorFieldType = (typeof VENDOR_FIELD_TYPES)[number];

export type VendorFieldDefLite = {
  key: string;
  labelVi: string;
  labelEn: string | null;
  type: string;
  options: string[];
  hint: string | null;
  required: boolean;
};

/** Mã NCC chuẩn: đúng 3 ký tự A-Z0-9 (khuôn Client.code). */
export const VENDOR_CODE_RE = /^[A-Z0-9]{3}$/;
/** Mã cũ (trước PUR-2) — vẫn chấp nhận khi KHÔNG đổi, để không khoá việc sửa hồ sơ NCC cũ. */
export const VENDOR_CODE_LEGACY_RE = /^[A-Z0-9-]{2,12}$/;

/** Số người liên hệ tối đa trên một NCC — chủ dự án nói "thứ 2 hoặc thứ 3"; chừa dư một chút. */
export const MAX_VENDOR_CONTACTS = 5;

/**
 * Sinh `key` cho trường tuỳ chỉnh từ nhãn: bỏ dấu, thường hoá, `_` thay khoảng trắng, cắt 32 ký tự.
 * Key là KHOÁ JSON của mọi NCC nên phải ổn định — chỉ dùng lúc TẠO, sau đó không đổi.
 */
export function fieldKeyFromLabel(label: string): string {
  const k = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return k || "field";
}

export function parseOptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function readCustomJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Đọc giá trị các trường tuỳ chỉnh từ FormData (`cf_<key>`), ép theo kiểu, GIỮ NGUYÊN giá trị của
 * trường không có trên form (trường đã tắt) — tắt trường không được xoá dữ liệu người dùng đã nhập.
 * Trả về `{ values, missing }` — missing = key bắt buộc mà bỏ trống.
 */
export function collectCustomValues(
  formData: FormData,
  defs: VendorFieldDefLite[],
  previous: Record<string, unknown>,
): { values: Record<string, unknown>; missing: string[] } {
  const values: Record<string, unknown> = { ...previous };
  const missing: string[] = [];
  for (const d of defs) {
    const raw = formData.get(`cf_${d.key}`);
    if (d.type === "BOOL") {
      values[d.key] = raw === "on" || raw === "true";
      continue;
    }
    const s = raw == null ? "" : String(raw).trim();
    if (!s) {
      delete values[d.key];
      if (d.required) missing.push(d.key);
      continue;
    }
    if (d.type === "NUMBER") {
      // Ô số trên form là NumberField → input ẩn gửi chuỗi số CHUẨN ("1500000" / "12.5"), không ngăn nghìn.
      const n = Number(s);
      if (Number.isFinite(n)) values[d.key] = n;
      else if (d.required) missing.push(d.key);
    } else if (d.type === "DATE") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) values[d.key] = s;
      else if (d.required) missing.push(d.key);
    } else if (d.type === "SELECT") {
      if (d.options.includes(s)) values[d.key] = s;
      else if (d.required) missing.push(d.key);
    } else values[d.key] = s.slice(0, d.type === "TEXTAREA" ? 2000 : 300);
  }
  return { values, missing };
}
