-- AlterTable
ALTER TABLE "advance" ADD COLUMN "cancelNote" TEXT;
ALTER TABLE "advance" ADD COLUMN "canceledAt" DATETIME;
ALTER TABLE "advance" ADD COLUMN "canceledById" TEXT;

-- AlterTable
ALTER TABLE "client_invoice" ADD COLUMN "voidNote" TEXT;
ALTER TABLE "client_invoice" ADD COLUMN "voidedAt" DATETIME;
ALTER TABLE "client_invoice" ADD COLUMN "voidedById" TEXT;

