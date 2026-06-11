-- Remove unused role variants from the live enum.
-- PostgreSQL cannot drop enum values directly, so recreate the type with only supported roles.
UPDATE "TeamMember" SET "role" = 'WRITER' WHERE "role"::text IN ('SALES', 'DESIGNER');
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('WRITER', 'PHOTOGRAPHER');
ALTER TABLE "TeamMember" ALTER COLUMN "role" TYPE "Role" USING "role"::text::"Role";
DROP TYPE "Role_old";

-- CreateTable
CREATE TABLE "SchedulerSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "eventTitle" TEXT NOT NULL DEFAULT 'Booking with {customerName}',
    "eventDescription" TEXT NOT NULL DEFAULT 'Created by Evergreen Scheduler.',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulerSettings_pkey" PRIMARY KEY ("id")
);

-- SeedDefaultSettings
INSERT INTO "SchedulerSettings" ("id", "eventTitle", "eventDescription", "updatedAt")
VALUES ('default', 'Booking with {customerName}', 'Created by Evergreen Scheduler.', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
