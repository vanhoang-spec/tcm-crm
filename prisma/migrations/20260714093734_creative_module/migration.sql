-- CreateTable
CREATE TABLE "team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true
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
    "teamId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "staff_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "staff_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
CREATE TABLE "brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "commission_scheme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL DEFAULT 'default',
    "baseCommissionAmount" INTEGER NOT NULL,
    "contractCommissionAmount" INTEGER NOT NULL,
    "note" TEXT,
    "updatedBy" TEXT,
    "updatedAt" DATETIME NOT NULL
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
    "taxCode" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "introducerId" TEXT,
    "ownerTeamId" TEXT NOT NULL,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 90,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "bankAccount" TEXT NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "client_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "option_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "option_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "option_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_introducerId_fkey" FOREIGN KEY ("introducerId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "client_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "care_note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "staffId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "care_note_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "care_note_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "birthday" DATETIME,
    "address" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "client_transfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "fromTeamId" TEXT NOT NULL,
    "toTeamId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "transferredById" TEXT NOT NULL,
    "approvedById" TEXT,
    "transferredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_transfer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_transfer_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_transfer_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_transfer_transferredById_fkey" FOREIGN KEY ("transferredById") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_transfer_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
CREATE TABLE "costsheet_template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "projectTypeId" TEXT,
    "contractTypeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "costsheet_template_projectTypeId_fkey" FOREIGN KEY ("projectTypeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "costsheet_template_contractTypeId_fkey" FOREIGN KEY ("contractTypeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "costsheet_template_section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "icon" TEXT,
    "nameVi" TEXT NOT NULL,
    "nameEn" TEXT,
    "colorSlot" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isProxy" BOOLEAN NOT NULL DEFAULT false,
    "proxyFeeType" TEXT,
    "proxyFeeVal" REAL,
    CONSTRAINT "costsheet_template_section_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "costsheet_template" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "costsheet_template_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "lineType" TEXT NOT NULL DEFAULT 'QTY_PRICE',
    "itemName" TEXT NOT NULL,
    "defaultSpecs" TEXT,
    "defaultQty" REAL NOT NULL DEFAULT 1,
    "defaultUnit" TEXT,
    "defaultUnitPrice" BIGINT NOT NULL DEFAULT 0,
    "fixedAmount" BIGINT,
    "percentVal" REAL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "maxMarkupPct" REAL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "costsheetTemplateId" TEXT,
    CONSTRAINT "costsheet_template_line_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "costsheet_template_section" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "costsheet_template_line_costsheetTemplateId_fkey" FOREIGN KEY ("costsheetTemplateId") REFERENCES "costsheet_template" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ownerTeamId" TEXT,
    "ownerId" TEXT,
    "leaderId" TEXT,
    "statusId" TEXT NOT NULL,
    "briefLinkUrl" TEXT NOT NULL,
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
    "activity" TEXT,
    "failReasonId" TEXT,
    "failReasonNote" TEXT,
    "processingAt" DATETIME,
    "liquidationAt" DATETIME,
    "finishedAt" DATETIME,
    "fiscalYear" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "project_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
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
CREATE TABLE "project_order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "briefLinkUrl" TEXT,
    "extraBriefInfo" TEXT,
    "outputRequest" TEXT,
    "desiredTimeline" DATETIME,
    "meetingAt" DATETIME,
    "meetingLocation" TEXT,
    "meetingFormat" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT,
    "acceptedAt" DATETIME,
    "acceptedById" TEXT,
    "resultLinkUrl" TEXT,
    "resultSentAt" DATETIME,
    "resultSentById" TEXT,
    "deadlineReminderSentAt" DATETIME,
    CONSTRAINT "project_order_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_order_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_order_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_order_resultSentById_fkey" FOREIGN KEY ("resultSentById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_order_creative_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    CONSTRAINT "project_order_creative_item_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "project_order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_order_attendee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    CONSTRAINT "project_order_attendee_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "project_order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_order_attendee_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bidding_round" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "roundNo" INTEGER NOT NULL,
    "roundDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientFeedback" TEXT,
    "revisedCe" BIGINT,
    "outcome" TEXT NOT NULL DEFAULT 'ongoing',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bidding_round_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bidding_round_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cost_sheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'CTRACT',
    "scenario" TEXT NOT NULL DEFAULT 'COST_UP',
    "templateId" TEXT,
    "ceTotal" BIGINT NOT NULL DEFAULT 0,
    "coTotal" BIGINT NOT NULL DEFAULT 0,
    "chiHo" BIGINT NOT NULL DEFAULT 0,
    "vatPct" REAL NOT NULL DEFAULT 0,
    "mgmtFeePct" REAL NOT NULL DEFAULT 0,
    "contingencyPct" REAL NOT NULL DEFAULT 0,
    "discountPct" REAL NOT NULL DEFAULT 0,
    "minMarginPct" REAL NOT NULL DEFAULT 31,
    "marginOverrideById" TEXT,
    "marginOverrideNote" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "rejectedById" TEXT,
    "rejectedNote" TEXT,
    "rejectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cost_sheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cost_sheet_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "costsheet_template" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cost_sheet_marginOverrideById_fkey" FOREIGN KEY ("marginOverrideById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cost_sheet_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cost_sheet_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cost_sheet_section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "costSheetId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "icon" TEXT,
    "nameVi" TEXT NOT NULL,
    "nameEn" TEXT,
    "colorSlot" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isProxy" BOOLEAN NOT NULL DEFAULT false,
    "proxyFeeType" TEXT,
    "proxyFeeVal" REAL,
    CONSTRAINT "cost_sheet_section_costSheetId_fkey" FOREIGN KEY ("costSheetId") REFERENCES "cost_sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cost_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "costSheetId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "lineType" TEXT NOT NULL DEFAULT 'QTY_PRICE',
    "itemName" TEXT NOT NULL,
    "specs" TEXT,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unitPrice" BIGINT NOT NULL DEFAULT 0,
    "fixedAmount" BIGINT,
    "percentVal" REAL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "vendorId" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "maxMarkupPct" REAL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    CONSTRAINT "cost_line_costSheetId_fkey" FOREIGN KEY ("costSheetId") REFERENCES "cost_sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cost_line_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "cost_sheet_section" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cost_line_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "contractNo" TEXT,
    "contractDate" DATETIME,
    "poNo" TEXT,
    "poDate" DATETIME,
    "paymentTermDays" INTEGER,
    "templateSource" TEXT,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "confirmEmailAt" DATETIME,
    "fileUrl" TEXT,
    "note" TEXT,
    "accountantConfirmedAt" DATETIME,
    "accountantConfirmedById" TEXT,
    "acceptanceDocsConfirmedAt" DATETIME,
    "acceptanceDocsConfirmedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contract_accountantConfirmedById_fkey" FOREIGN KEY ("accountantConfirmedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "contract_acceptanceDocsConfirmedById_fkey" FOREIGN KEY ("acceptanceDocsConfirmedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "roleInProject" TEXT NOT NULL DEFAULT 'CORE',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_member_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_member_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "timeline_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "ownerStaffId" TEXT,
    "departmentCode" TEXT,
    "statusId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "externalPublished" BOOLEAN NOT NULL DEFAULT false,
    "externalTitle" TEXT,
    "externalStartDate" DATETIME,
    "externalEndDate" DATETIME,
    "clientEditable" BOOLEAN NOT NULL DEFAULT false,
    "clientStatus" TEXT,
    "clientNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "timeline_item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "timeline_item_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "timeline_item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "timeline_item_ownerStaffId_fkey" FOREIGN KEY ("ownerStaffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "timeline_item_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "timeline_comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorStaffId" TEXT,
    "authorGuestId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "timeline_comment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "timeline_item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "timeline_comment_authorStaffId_fkey" FOREIGN KEY ("authorStaffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "timeline_comment_authorGuestId_fkey" FOREIGN KEY ("authorGuestId") REFERENCES "guest_invite" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "guest_invite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "contactId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "lastAccessAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guest_invite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "guest_invite_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "guest_invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "creative_task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "orderId" TEXT,
    "orderedById" TEXT,
    "sourceItemLabel" TEXT,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "creative_task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "creative_task_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "project_order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "team_code_key" ON "team"("code");

-- CreateIndex
CREATE UNIQUE INDEX "department_code_key" ON "department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "staff_code_key" ON "staff"("code");

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "option_set_code_key" ON "option_set"("code");

-- CreateIndex
CREATE UNIQUE INDEX "option_item_setId_code_key" ON "option_item"("setId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "brand_name_key" ON "brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "commission_scheme_code_key" ON "commission_scheme"("code");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "notification_recipientStaffId_isRead_idx" ON "notification"("recipientStaffId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "client_code_key" ON "client"("code");

-- CreateIndex
CREATE INDEX "care_note_clientId_createdAt_idx" ON "care_note"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_code_key" ON "vendor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "setting_module_key_scope_scopeRef_key" ON "setting"("module", "key", "scope", "scopeRef");

-- CreateIndex
CREATE UNIQUE INDEX "project_code_key" ON "project"("code");

-- CreateIndex
CREATE INDEX "project_ownerTeamId_statusId_idx" ON "project"("ownerTeamId", "statusId");

-- CreateIndex
CREATE UNIQUE INDEX "project_order_projectId_department_key" ON "project_order"("projectId", "department");

-- CreateIndex
CREATE UNIQUE INDEX "project_order_attendee_orderId_staffId_key" ON "project_order_attendee"("orderId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_projectId_key" ON "contract"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_projectId_staffId_key" ON "project_member"("projectId", "staffId");

-- CreateIndex
CREATE INDEX "timeline_item_projectId_sort_idx" ON "timeline_item"("projectId", "sort");

-- CreateIndex
CREATE INDEX "timeline_comment_itemId_createdAt_idx" ON "timeline_comment"("itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "guest_invite_tokenHash_key" ON "guest_invite"("tokenHash");

-- CreateIndex
CREATE INDEX "guest_invite_projectId_idx" ON "guest_invite"("projectId");

-- CreateIndex
CREATE INDEX "creative_task_projectId_status_idx" ON "creative_task"("projectId", "status");

-- CreateIndex
CREATE INDEX "creative_task_assigneeId_status_idx" ON "creative_task"("assigneeId", "status");
