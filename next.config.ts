import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
