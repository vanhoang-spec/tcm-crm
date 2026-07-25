/**
 * "Hồ sơ khách hàng đủ" = đủ thông tin bắt buộc phải có TRƯỚC KHI ký hợp đồng thật (MST, địa chỉ,
 * TK ngân hàng — cần cho xuất hoá đơn/thanh toán; ngành hàng + phân loại vendor-list — cần cho báo
 * cáo/quy trình bidding). Các trường này nullable ở DB (xem prisma/schema.prisma) để chấp nhận
 * import khách hàng từ danh sách cũ chưa đầy đủ — nhưng KHÔNG được thiếu khi dự án thật sự chuyển
 * sang thực thi (xem guard trong bidding/actions.ts moveToProcessing).
 */

export type ClientProfileFields = {
  taxCode: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  bankAccount: string | null;
  industryId: string | null;
  classificationId: string | null;
};

export type MissingClientField = "taxCode" | "address" | "phone" | "email" | "bankAccount" | "industryId" | "classificationId";

const REQUIRED_FIELDS: MissingClientField[] = [
  "taxCode",
  "address",
  "phone",
  "email",
  "bankAccount",
  "industryId",
  "classificationId",
];

export function getMissingClientProfileFields(client: ClientProfileFields): MissingClientField[] {
  return REQUIRED_FIELDS.filter((f) => !client[f]);
}

export function isClientProfileComplete(client: ClientProfileFields): boolean {
  return getMissingClientProfileFields(client).length === 0;
}
