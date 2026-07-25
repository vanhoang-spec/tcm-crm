import { prisma } from "./prisma";

/** Đọc tham số số học từ bảng setting (scope GLOBAL). Rơi về fallback nếu chưa cấu hình. */
export async function getNumberSetting(module: string, key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module, key, scope: "GLOBAL", scopeRef: "" } },
  });
  const n = s ? Number(s.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Đọc tham số chuỗi từ bảng setting (scope GLOBAL). Rơi về fallback nếu chưa cấu hình. */
export async function getStringSetting(module: string, key: string, fallback: string): Promise<string> {
  const s = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module, key, scope: "GLOBAL", scopeRef: "" } },
  });
  return s && s.value.trim() ? s.value : fallback;
}
