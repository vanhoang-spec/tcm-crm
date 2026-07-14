import type { Badge } from "@/components/ui/badge";

type Tone = React.ComponentProps<typeof Badge>["tone"];

/** Màu badge theo trạng thái dự án (code cố định của option_set "project_status") — dùng chung ở list & detail. */
export const STATUS_TONE: Record<string, Tone> = {
  BIDDING: "brand",
  PENDING: "neutral",
  PROCESSING: "success",
  LIQUIDATION: "warning",
  FINISHED: "success",
  FAILED: "danger",
  CANCELED: "neutral",
  HANDOVER: "warning",
};

export const TEAM_TONE: Record<string, Tone> = { A1: "brand", A2: "success", A3: "warning" };

export const COMPLEXITY_TONE: Record<string, Tone> = { SIMPLE: "neutral", MEDIUM: "brand", COMPLEX: "warning" };

/** colorSlot lưu trong CostsheetTemplateSection/CostSheetSection — map sang Badge tone. */
export const SECTION_COLOR_TONE: Record<string, Tone> = {
  brand: "brand",
  success: "success",
  warning: "warning",
  danger: "danger",
  neutral: "neutral",
};
