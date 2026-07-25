-- AlterTable
ALTER TABLE "conversation_member" ADD COLUMN "historyVisibleFrom" DATETIME;
ALTER TABLE "conversation_member" ADD COLUMN "sidebarPinnedAt" DATETIME;

-- AlterTable
ALTER TABLE "staff" ADD COLUMN "firstWorkDate" DATETIME;
