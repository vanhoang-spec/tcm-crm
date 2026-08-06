-- CreateTable
CREATE TABLE "department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadStaffId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "costPrefix" TEXT,
    CONSTRAINT "department_leadStaffId_fkey" FOREIGN KEY ("leadStaffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "groupCode" TEXT NOT NULL,
    "parentRoleId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "role_parentRoleId_fkey" FOREIGN KEY ("parentRoleId") REFERENCES "role" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    "permissionCode" TEXT NOT NULL,
    CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "title" TEXT,
    "departmentId" TEXT,
    "roleId" TEXT,
    "avatarKey" TEXT,
    "dateOfBirth" DATETIME,
    "firstWorkDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "payrollExempt" BOOLEAN NOT NULL DEFAULT false,
    "isPlanningStaff" BOOLEAN NOT NULL DEFAULT false,
    "creativeSquadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "passwordHash" TEXT,
    "passwordChangedAt" DATETIME,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "gender" TEXT,
    "workLocation" TEXT,
    "managerId" TEXT,
    CONSTRAINT "staff_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "staff_creativeSquadId_fkey" FOREIGN KEY ("creativeSquadId") REFERENCES "creative_squad" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "staff_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "staff_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "option_set" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "option_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelVi" TEXT NOT NULL,
    "labelEn" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "option_item_setId_fkey" FOREIGN KEY ("setId") REFERENCES "option_set" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "action" TEXT NOT NULL,
    "changedBy" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipientStaffId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "projectId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_recipientStaffId_fkey" FOREIGN KEY ("recipientStaffId") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalNameVi" TEXT,
    "legalNameEn" TEXT,
    "taxCode" TEXT,
    "industryId" TEXT,
    "statusId" TEXT NOT NULL,
    "classificationId" TEXT,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "introducerId" TEXT,
    "quoteTemplateCode" TEXT,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 90,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bankAccount" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "client_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "client_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "option_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "client_introducerId_fkey" FOREIGN KEY ("introducerId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "module" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "scopeRef" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ownerId" TEXT,
    "leaderId" TEXT,
    "statusId" TEXT NOT NULL,
    "briefLinkUrl" TEXT,
    "projectTypeId" TEXT,
    "complexityId" TEXT NOT NULL,
    "goNogoStatus" TEXT,
    "goNogoNote" TEXT,
    "goNogoById" TEXT,
    "goNogoAt" DATETIME,
    "budget" BIGINT,
    "channelId" TEXT,
    "scope" TEXT,
    "scale" TEXT,
    "venue" TEXT,
    "eventStartDate" DATETIME,
    "eventEndDate" DATETIME,
    "activity" TEXT,
    "failReasonId" TEXT,
    "failReasonNote" TEXT,
    "processingAt" DATETIME,
    "liquidationAt" DATETIME,
    "finishedAt" DATETIME,
    "fiscalYear" INTEGER NOT NULL,
    "isoFolderUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "stockCampaignOpenedAt" DATETIME,
    CONSTRAINT "project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "option_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "project_projectTypeId_fkey" FOREIGN KEY ("projectTypeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_complexityId_fkey" FOREIGN KEY ("complexityId") REFERENCES "option_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "project_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_failReasonId_fkey" FOREIGN KEY ("failReasonId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_goNogoById_fkey" FOREIGN KEY ("goNogoById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "password_reset_token" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "password_reset_token_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "creative_squad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadStaffId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "creative_squad_leadStaffId_fkey" FOREIGN KEY ("leadStaffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "creative_task_approver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "approvedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "creative_task_approver_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "creative_task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "creative_task_approver_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "creative_task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "orderedById" TEXT,
    "sourceItemLabel" TEXT,
    "squadId" TEXT,
    "taskTypeId" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNASSIGNED',
    "assigneeId" TEXT,
    "assignedById" TEXT,
    "assignedAt" DATETIME,
    "cdApprovalNotRequired" BOOLEAN NOT NULL DEFAULT false,
    "deadline" DATETIME,
    "deliverableLinkUrl" TEXT,
    "hoursSpent" REAL,
    "submittedAt" DATETIME,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "deliveredAt" DATETIME,
    "deadlineReminderSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "creative_task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "creative_task_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "creative_squad" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "creative_salary_budget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionTitle" TEXT NOT NULL,
    "periodCode" TEXT NOT NULL,
    "monthlySalary" BIGINT NOT NULL,
    "headcountOverride" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "creative_allocation_ratio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionTitle" TEXT NOT NULL,
    "taskTypeId" TEXT NOT NULL,
    "periodCode" TEXT NOT NULL,
    "percent" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "creative_allocation_ratio_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "option_item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "position_salary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionTitle" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "periodCode" TEXT NOT NULL,
    "monthlySalary" BIGINT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "department_code_key" ON "department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

-- CreateIndex
CREATE INDEX "role_permission_roleId_idx" ON "role_permission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_roleId_permissionCode_key" ON "role_permission"("roleId", "permissionCode");

-- CreateIndex
CREATE UNIQUE INDEX "staff_code_key" ON "staff"("code");

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "option_set_code_key" ON "option_set"("code");

-- CreateIndex
CREATE UNIQUE INDEX "option_item_setId_code_key" ON "option_item"("setId", "code");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "notification_recipientStaffId_isRead_idx" ON "notification"("recipientStaffId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "client_code_key" ON "client"("code");

-- CreateIndex
CREATE UNIQUE INDEX "setting_module_key_scope_scopeRef_key" ON "setting"("module", "key", "scope", "scopeRef");

-- CreateIndex
CREATE UNIQUE INDEX "project_code_key" ON "project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_tokenHash_key" ON "password_reset_token"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_token_staffId_idx" ON "password_reset_token"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "creative_squad_code_key" ON "creative_squad"("code");

-- CreateIndex
CREATE UNIQUE INDEX "creative_task_approver_taskId_staffId_key" ON "creative_task_approver"("taskId", "staffId");

-- CreateIndex
CREATE INDEX "creative_task_projectId_status_idx" ON "creative_task"("projectId", "status");

-- CreateIndex
CREATE INDEX "creative_task_assigneeId_status_idx" ON "creative_task"("assigneeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "creative_salary_budget_positionTitle_periodCode_key" ON "creative_salary_budget"("positionTitle", "periodCode");

-- CreateIndex
CREATE UNIQUE INDEX "creative_allocation_ratio_positionTitle_taskTypeId_periodCode_key" ON "creative_allocation_ratio"("positionTitle", "taskTypeId", "periodCode");

-- CreateIndex
CREATE UNIQUE INDEX "position_salary_positionTitle_departmentCode_periodCode_key" ON "position_salary"("positionTitle", "departmentCode", "periodCode");

