-- AlterTable
ALTER TABLE "message" ADD COLUMN "attachmentDurationSec" INTEGER;
ALTER TABLE "message" ADD COLUMN "attachmentKey" TEXT;
ALTER TABLE "message" ADD COLUMN "attachmentMime" TEXT;
ALTER TABLE "message" ADD COLUMN "attachmentName" TEXT;
ALTER TABLE "message" ADD COLUMN "attachmentSize" INTEGER;
