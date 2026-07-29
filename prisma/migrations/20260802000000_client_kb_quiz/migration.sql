-- Kho kiến thức theo khách (H3): câu hỏi kiểm tra + lượt làm bài.
-- Toàn bảng MỚI, không đụng 4 bảng của H2. "Quiz của chủ đề" = tập câu hỏi isActive của chủ đề —
-- cố ý KHÔNG có model Quiz riêng.
--
-- correctIndex chỉ được đọc ở đường CHẤM ĐIỂM phía server (lib/client-kb-data.ts:loadQuizAnswerKey).
-- Đường render bài dùng loadQuizQuestions, không select cột này.
--
-- passPct chốt ngưỡng đạt TẠI THỜI ĐIỂM CHẤM: đổi setting clients.kb_pass_pct về sau không được
-- chấm lại các lượt đã lưu.

-- CreateTable
CREATE TABLE "client_kb_question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "optionsJson" TEXT NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "client_kb_question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "client_kb_topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "client_kb_attempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "passPct" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "answersJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_kb_attempt_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "client_kb_topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "client_kb_attempt_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "client_kb_question_topicId_isActive_idx" ON "client_kb_question"("topicId", "isActive");

-- CreateIndex
CREATE INDEX "client_kb_attempt_topicId_staffId_idx" ON "client_kb_attempt"("topicId", "staffId");

-- CreateIndex
CREATE INDEX "client_kb_attempt_staffId_passed_idx" ON "client_kb_attempt"("staffId", "passed");

