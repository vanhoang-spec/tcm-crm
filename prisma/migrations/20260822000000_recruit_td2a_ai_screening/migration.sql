-- TD-2a (22/08/2026): AI chấm CV theo thang 100 + cổng sàng lọc phỏng vấn/không.
--
-- VIẾT TAY (thuần additive). `prisma migrate diff` đòi RedefineTables cho CẢ `candidate` lẫn
-- `job_position` chỉ vì thêm mấy cột nullable — mà `candidate` đang có FK trỏ TỚI nó
-- (interview.candidateId, và giờ thêm candidate_ai_review.candidateId), `job_position` thì có
-- candidate.positionId. DROP rồi dựng lại hai bảng đó là rủi ro không cần thiết.
-- Đây là lần thứ 9 phải né bẫy này — xem HANDOVER mục 10.26 / 10.30 / 10.35.

-- AlterTable: cờ vị trí quản lý ⇒ chấm bằng BỘ tiêu chí MANAGER.
ALTER TABLE "job_position" ADD COLUMN "isManagerial" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: trạng thái lượt AI chấm (chạy nền, ngoài vòng đời request).
ALTER TABLE "candidate" ADD COLUMN "aiReviewStatus" TEXT;
ALTER TABLE "candidate" ADD COLUMN "aiReviewError" TEXT;

-- AlterTable: quyết định ở cổng sàng lọc sau khi AI chấm.
ALTER TABLE "candidate" ADD COLUMN "screenDecision" TEXT;
ALTER TABLE "candidate" ADD COLUMN "screenDecidedAt" DATETIME;
ALTER TABLE "candidate" ADD COLUMN "screenDecidedById" TEXT REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: tiêu chí chấm điểm (danh mục mềm, HR sửa trong Settings).
CREATE TABLE "recruit_criterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stage" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelVi" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "hint" TEXT,
    "weight" INTEGER NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable: một lượt AI chấm CV (nhiều dòng / ứng viên, đọc lấy dòng mới nhất).
CREATE TABLE "candidate_ai_review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "recommendation" TEXT NOT NULL,
    "summary" TEXT,
    "strengths" TEXT,
    "concerns" TEXT,
    "criteriaJson" TEXT NOT NULL,
    "model" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "candidate_ai_review_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "candidate_ai_review_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "recruit_criterion_stage_scope_isActive_idx" ON "recruit_criterion"("stage", "scope", "isActive");
CREATE UNIQUE INDEX "recruit_criterion_stage_scope_code_key" ON "recruit_criterion"("stage", "scope", "code");
CREATE INDEX "candidate_ai_review_candidateId_createdAt_idx" ON "candidate_ai_review"("candidateId", "createdAt");
