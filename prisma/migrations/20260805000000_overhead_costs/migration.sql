-- Module Chi phí văn phòng (OVH-1) — thuần additive: chỉ CREATE TABLE + CREATE INDEX, không đụng
-- bảng nào đang có. Chạy được thẳng trên production đang có dữ liệu.
--
-- Bốn bảng: ngân sách theo NĂM (có luồng duyệt CFO → CEO), khoản chi, ngân sách theo (khoản × tháng),
-- và từng lần chi thực tế. Xem chú thích chi tiết trong prisma/schema.prisma.

-- CreateTable
CREATE TABLE "overhead_budget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fiscalYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceFileKey" TEXT,
    "note" TEXT,
    "submittedAt" DATETIME,
    "submittedById" TEXT,
    "cfoApprovedAt" DATETIME,
    "cfoApprovedById" TEXT,
    "ceoApprovedAt" DATETIME,
    "ceoApprovedById" TEXT,
    "rejectedAt" DATETIME,
    "rejectedById" TEXT,
    "rejectedNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "overhead_budget_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "overhead_budget_cfoApprovedById_fkey" FOREIGN KEY ("cfoApprovedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "overhead_budget_ceoApprovedById_fkey" FOREIGN KEY ("ceoApprovedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "overhead_budget_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "overhead_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "pidCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryLabel" TEXT NOT NULL,
    "requestKind" TEXT NOT NULL DEFAULT 'MONTHLY',
    "actualSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    CONSTRAINT "overhead_item_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "overhead_budget" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "overhead_budget_month" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "overhead_budget_month_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "overhead_item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "overhead_spend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "expectedDate" DATETIME,
    "amountNet" BIGINT NOT NULL DEFAULT 0,
    "vat" BIGINT NOT NULL DEFAULT 0,
    "tncn" BIGINT NOT NULL DEFAULT 0,
    "tndn" BIGINT NOT NULL DEFAULT 0,
    "amountTotal" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "paidDate" DATETIME,
    "paidById" TEXT,
    "requestedById" TEXT,
    "createdById" TEXT,
    "overBudgetNote" TEXT,
    "cancelNote" TEXT,
    "reverseNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "overhead_spend_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "overhead_item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "overhead_spend_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "overhead_spend_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "overhead_spend_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "overhead_budget_fiscalYear_key" ON "overhead_budget"("fiscalYear");

-- CreateIndex
CREATE INDEX "overhead_item_budgetId_idx" ON "overhead_item"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "overhead_item_budgetId_pidCode_key" ON "overhead_item"("budgetId", "pidCode");

-- CreateIndex
CREATE UNIQUE INDEX "overhead_budget_month_itemId_month_key" ON "overhead_budget_month"("itemId", "month");

-- CreateIndex
CREATE INDEX "overhead_spend_itemId_month_idx" ON "overhead_spend"("itemId", "month");

-- CreateIndex
CREATE INDEX "overhead_spend_status_idx" ON "overhead_spend"("status");

