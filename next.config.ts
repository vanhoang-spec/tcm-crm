import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /**
   * ⚠ `pdf-parse` PHẢI nằm ngoài gói bundle của server — ĐỪNG GỠ DÒNG NÀY.
   *
   * `pdf-parse` v2 chạy trên `pdfjs-dist`, và pdfjs nạp `pdf.worker.mjs` bằng đường dẫn tính lúc
   * CHẠY. Khi Next đóng gói nó vào `.next/server/chunks`, file worker KHÔNG được đưa theo, nên mọi
   * lần đọc PDF đều chết với:
   *     Setting up fake worker failed: "Cannot find module '.../chunks/ssr/pdf.worker.mjs'"
   * `extractTextFromFile` NUỐT lỗi này (cố ý — một file hỏng không được làm sập cả yêu cầu AI), nên
   * triệu chứng nhìn từ ngoài là "app chỉ đọc được Word, không đọc được PDF" mà không có lỗi nào
   * hiện ra. Chạy ngoài Next (script tsx) thì pdf-parse hoạt động bình thường — đó là lý do lỗi này
   * sống sót lâu: test kiểu nào cũng qua, chỉ chạy thật trong app mới lộ.
   *
   * Khai ở đây là Next để nguyên `require("pdf-parse")` cho Node tự phân giải từ `node_modules`,
   * nơi file worker vẫn nằm cạnh thư viện.
   *
   * Ảnh hưởng nếu gỡ: đọc CV tuyển dụng · tài liệu kho kiến thức khách · báo giá NCC · biên bản
   * họp · file đính kèm AI — tất cả các đường PDF đều hỏng THẦM LẶNG.
   */
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    /**
     * Server Action mặc định chỉ nhận body 1MB — vượt là Next ném 413 "Body exceeded 1 MB limit"
     * TRƯỚC khi code của mình chạy, nên người dùng thấy TRANG VỠ chứ không thấy thông báo lỗi.
     *
     * Mọi đường upload của app đều đi qua Server Action và đều khai trần LỚN HƠN 1MB:
     * chat 10MB (chat-storage.ts) · KB chung 25MB (kb-storage.ts) · file AI 15MB
     * (ai-file-storage.ts) · avatar 3MB (staff-avatar-storage.ts) · tài liệu KB khách 25MB
     * (client-kb-storage.ts). Thiếu dòng này thì mọi trần đó chỉ là con số trên giấy.
     *
     * Để 30MB chứ không phải đúng 25MB vì trần này tính trên RAW body, gồm cả phần đệm
     * multipart (boundary, header từng part) — chừa dư để GUARD TRONG CODE là chỗ báo lỗi tử tế,
     * không phải Next. Nâng trần ở storage nào thì nhớ nâng cả ở đây.
     */
    serverActions: { bodySizeLimit: "30mb" },
  },
};

export default withNextIntl(nextConfig);
