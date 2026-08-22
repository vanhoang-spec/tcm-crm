-- TD-2b (22/08/2026): mẫu thư gửi ứng viên (duyệt một lần rồi dùng) + sổ thư đã gửi.
-- Thuần additive: chỉ 2 bảng MỚI, không đụng cột nào của bảng cũ (đã kiểm: 0 DROP, 0 RedefineTables).


-- CreateTable
CREATE TABLE "recruit_email_template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "recruit_email_template_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recruit_email_template_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "recruit_email_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateCode" TEXT NOT NULL,
    "candidateId" TEXT,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "sentById" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recruit_email_log_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recruit_email_log_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "recruit_email_template_code_key" ON "recruit_email_template"("code");

-- CreateIndex
CREATE INDEX "recruit_email_log_candidateId_sentAt_idx" ON "recruit_email_log"("candidateId", "sentAt");

-- CreateIndex
CREATE INDEX "recruit_email_log_status_sentAt_idx" ON "recruit_email_log"("status", "sentAt");

