/**
 * Định nghĩa 27 cột Excel (A→AA) của form BM08/QT.TCM.16 — nguồn chung cho parser (src/lib/ctv.ts,
 * server-only vì import exceljs/docxtemplater) + lưới UI (client component). File này THUẦN, không
 * import gì cả, để an toàn dùng được ở cả client lẫn server — KHÔNG import trực tiếp từ ctv.ts vào
 * component "use client" (ctv.ts kéo theo exceljs/pizzip/docxtemplater, không chạy được ở browser).
 */
export const CTV_COLUMNS = [
  { key: "fullName", excelCol: "B", labelVi: "Họ và tên", labelEn: "Full name", type: "string" },
  { key: "gender", excelCol: "C", labelVi: "Giới tính", labelEn: "Gender", type: "string" },
  { key: "dateOfBirth", excelCol: "D", labelVi: "Ngày sinh", labelEn: "Date of birth", type: "string" },
  { key: "nationality", excelCol: "E", labelVi: "Quốc tịch", labelEn: "Nationality", type: "string" },
  { key: "idNumber", excelCol: "F", labelVi: "Số CCCD/Passport", labelEn: "ID/Passport no.", type: "string" },
  { key: "idIssueDate", excelCol: "G", labelVi: "Ngày cấp", labelEn: "ID issue date", type: "string" },
  { key: "idIssuePlace", excelCol: "H", labelVi: "Nơi cấp", labelEn: "ID issue place", type: "string" },
  { key: "permanentAddress", excelCol: "I", labelVi: "Địa chỉ thường trú", labelEn: "Permanent address", type: "string" },
  { key: "taxCode", excelCol: "J", labelVi: "Mã số thuế", labelEn: "Tax code", type: "string" },
  { key: "bankAccountNo", excelCol: "K", labelVi: "Số TK NH", labelEn: "Bank account no.", type: "string" },
  { key: "bankName", excelCol: "L", labelVi: "Tên ngân hàng", labelEn: "Bank name", type: "string" },
  { key: "bankBranch", excelCol: "M", labelVi: "Chi nhánh", labelEn: "Branch", type: "string" },
  { key: "phone", excelCol: "N", labelVi: "SĐT", labelEn: "Phone", type: "string" },
  { key: "eventName", excelCol: "O", labelVi: "Tên event", labelEn: "Event name", type: "string" },
  { key: "executionDate", excelCol: "P", labelVi: "Ngày thực hiện", labelEn: "Execution date", type: "string" },
  { key: "acceptanceDate", excelCol: "Q", labelVi: "Ngày nghiệm thu", labelEn: "Acceptance date", type: "string" },
  { key: "executionLocation", excelCol: "R", labelVi: "Địa điểm thực hiện", labelEn: "Execution location", type: "string" },
  { key: "workItem", excelCol: "S", labelVi: "Hạng mục công việc", labelEn: "Work item", type: "string" },
  { key: "unit", excelCol: "T", labelVi: "ĐVT", labelEn: "Unit", type: "string" },
  { key: "quantity", excelCol: "U", labelVi: "Số lượng", labelEn: "Quantity", type: "number" },
  { key: "unitPrice", excelCol: "V", labelVi: "Đơn giá", labelEn: "Unit price", type: "money" },
  { key: "amount", excelCol: "W", labelVi: "Thành tiền", labelEn: "Amount", type: "money" },
  { key: "grossNet", excelCol: "X", labelVi: "Gross/Net", labelEn: "Gross/Net", type: "string" },
  { key: "pitTax", excelCol: "Y", labelVi: "Thuế TNCN", labelEn: "PIT withheld", type: "money" },
  { key: "netReceived", excelCol: "Z", labelVi: "Thực nhận", labelEn: "Net received", type: "money" },
  { key: "note", excelCol: "AA", labelVi: "Ghi chú", labelEn: "Note", type: "string" },
] as const;

export type CtvColumnKey = (typeof CTV_COLUMNS)[number]["key"];
