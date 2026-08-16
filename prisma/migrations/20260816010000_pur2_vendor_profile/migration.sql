-- PUR-2 (16/08/2026): ho so NCC mo rong — legalName + customJson tren vendor, bang vendor_contact (N nguoi lien he),
-- bang vendor_field_def (truong tuy chinh admin dinh nghia). Sinh bang prisma migrate diff, DA KIEM: khong DROP / RedefineTables.
-- AlterTable
ALTER TABLE "vendor" ADD COLUMN "customJson" TEXT;
ALTER TABLE "vendor" ADD COLUMN "legalName" TEXT;

-- CreateTable
CREATE TABLE "vendor_contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendor_contact_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vendor_field_def" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "labelVi" TEXT NOT NULL,
    "labelEn" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "optionsJson" TEXT,
    "hint" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "vendor_contact_vendorId_idx" ON "vendor_contact"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_field_def_key_key" ON "vendor_field_def"("key");

