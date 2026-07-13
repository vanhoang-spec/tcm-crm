import { z } from "zod";

export const clientFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Mã khách hàng tối thiểu 2 ký tự")
    .max(20, "Mã khách hàng tối đa 20 ký tự")
    .regex(/^[A-Z0-9_-]+$/i, "Chỉ dùng chữ, số, gạch ngang/gạch dưới")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, "Tên khách hàng bắt buộc"),
  brand: z.string().trim().optional().or(z.literal("")),
  industryId: z.string().optional().or(z.literal("")),
  ownerTeamId: z.string().min(1, "Chọn team phụ trách"),
  introducerId: z.string().optional().or(z.literal("")),
  isNew: z.boolean().default(true),
  paymentTermDays: z.coerce.number().int().min(0).max(365).default(90),
  address: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Email không hợp lệ").optional().or(z.literal("")),
  note: z.string().trim().optional().or(z.literal("")),
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;
