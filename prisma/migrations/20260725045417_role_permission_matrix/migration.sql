-- CreateTable
CREATE TABLE "role_permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    "permissionCode" TEXT NOT NULL,
    CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "role_permission_roleId_idx" ON "role_permission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_roleId_permissionCode_key" ON "role_permission"("roleId", "permissionCode");
