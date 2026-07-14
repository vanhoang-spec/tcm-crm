import { z } from "zod";

export const MAX_CONTACTS = 10;

/** Giá trị sentinel cho "Người giới thiệu = Khác (không phải nhân viên công ty)" — introducerId lưu null trong DB. */
export const OTHER_INTRODUCER = "OTHER";

// MST Việt Nam: 10 số (doanh nghiệp/cá nhân) hoặc 10 số + "-" + 3 số (chi nhánh).
const TAX_CODE_REGEX = /^\d{10}(-\d{3})?$/;
const PHONE_REGEX = /^[0-9+\-\s()]{8,20}$/;

/** t = getTranslations("validation.client") — thông báo lỗi theo locale của request. */
export function getClientFormSchema(t: (key: string) => string) {
  return z.object({
    code: z
      .string()
      .trim()
      .length(3, t("codeLength"))
      .regex(/^[A-Z0-9]+$/i, t("codeFormat"))
      .transform((v) => v.toUpperCase()),
    name: z.string().trim().min(2, t("nameRequired")),
    taxCode: z.string().trim().regex(TAX_CODE_REGEX, t("taxCodeFormat")),
    brandName: z.string().trim().min(1, t("brandRequired")),
    industryId: z.string().min(1, t("industryRequired")),
    statusId: z.string().min(1, t("statusRequired")),
    classificationId: z.string().min(1, t("classificationRequired")),
    ownerTeamId: z.string().min(1, t("teamRequired")),
    introducerId: z.string().min(1, t("introducerRequired")),
    isNew: z.boolean().default(true),
    paymentTermDays: z.coerce.number().int().min(0).max(365),
    address: z.string().trim().min(1, t("addressRequired")),
    phone: z.string().trim().regex(PHONE_REGEX, t("phoneFormat")),
    email: z.string().trim().email(t("emailFormat")),
    bankAccount: z.string().trim().min(1, t("bankAccountRequired")),
    note: z.string().trim().optional().or(z.literal("")),
  });
}

export type ClientFormValues = z.infer<ReturnType<typeof getClientFormSchema>>;

/** t = getTranslations("validation.contact") */
export function getContactSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().min(1, t("nameRequired")),
    title: z.string().trim().min(1, t("titleRequired")),
    phone: z.string().trim().regex(PHONE_REGEX, t("phoneFormat")),
    email: z.string().trim().email(t("emailFormat")),
  });
}

export function getContactListSchema(t: (key: string, values?: Record<string, string | number | Date>) => string) {
  return z
    .array(getContactSchema(t))
    .min(1, t("listMin"))
    .max(MAX_CONTACTS, t("listMax", { max: MAX_CONTACTS }));
}

export type ContactFormValues = z.infer<ReturnType<typeof getContactSchema>>;
