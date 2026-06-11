-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill deterministic role-local priority from the existing admin order.
WITH ordered_members AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "role" ORDER BY "name" ASC, "id" ASC) - 1 AS "nextSortOrder"
  FROM "TeamMember"
)
UPDATE "TeamMember"
SET "sortOrder" = ordered_members."nextSortOrder"
FROM ordered_members
WHERE "TeamMember"."id" = ordered_members."id";

-- CreateIndex
CREATE INDEX "TeamMember_role_active_sortOrder_idx" ON "TeamMember"("role", "active", "sortOrder");
