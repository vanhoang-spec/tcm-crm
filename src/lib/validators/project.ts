import { z } from "zod";

/** Giá trị sentinel cho "Đợi BGĐ giao team Account" — ownerTeamId lưu null trong DB. */
export const PENDING_TEAM_ASSIGNMENT = "PENDING_TEAM_ASSIGNMENT";

/** t = getTranslations("bidding.validation") — thông báo lỗi theo locale. */
export function getProjectIntakeSchema(t: (key: string) => string) {
  return z
    .object({
      name: z.string().trim().min(2, t("nameRequired")),
      clientId: z.string().min(1, t("clientRequired")),
      ownerTeamId: z.string().min(1, t("teamRequired")),
      ownerId: z.string().optional().or(z.literal("")),
      briefLinkUrl: z.string().trim().url(t("briefLinkRequired")),
      projectTypeId: z.string().min(1, t("typeRequired")),
      complexityId: z.string().min(1, t("complexityRequired")),
      budget: z.coerce.number().int().min(0).optional(),
      channelId: z.string().optional().or(z.literal("")),
      scope: z.string().trim().optional().or(z.literal("")),
      venue: z.string().trim().optional().or(z.literal("")),
      // Ngày sự kiện ("YYYY-MM-DD") — event 1 ngày chỉ nhập ngày bắt đầu; nhiều ngày nhập cả hai.
      eventStartDate: z.string().trim().optional().or(z.literal("")),
      eventEndDate: z.string().trim().optional().or(z.literal("")),
    })
    .superRefine((v, ctx) => {
      if (v.eventStartDate && v.eventEndDate && v.eventEndDate < v.eventStartDate) {
        ctx.addIssue({ code: "custom", path: ["eventEndDate"], message: t("eventEndBeforeStart") });
      }
    });
}

export type ProjectIntakeValues = z.infer<ReturnType<typeof getProjectIntakeSchema>>;
