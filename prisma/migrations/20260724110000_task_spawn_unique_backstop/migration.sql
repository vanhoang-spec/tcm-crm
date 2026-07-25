-- CreateIndex
CREATE UNIQUE INDEX "creative_task_orderId_sourceItemLabel_key" ON "creative_task"("orderId", "sourceItemLabel");

-- CreateIndex
CREATE UNIQUE INDEX "department_task_orderId_sourceKey_key" ON "department_task"("orderId", "sourceKey");

