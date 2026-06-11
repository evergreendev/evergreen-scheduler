-- CreateEnum
CREATE TYPE "Role" AS ENUM ('WRITER', 'PHOTOGRAPHER', 'SALES', 'DESIGNER');

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "googleRefreshToken" TEXT,
    "googleCalendarId" TEXT NOT NULL DEFAULT 'primary',
    "lastBookedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "writerId" TEXT NOT NULL,
    "photographerId" TEXT NOT NULL,
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_email_key" ON "TeamMember"("email");

-- CreateIndex
CREATE INDEX "TeamMember_role_active_idx" ON "TeamMember"("role", "active");

-- CreateIndex
CREATE INDEX "Booking_startTime_endTime_idx" ON "Booking"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "Booking_writerId_startTime_idx" ON "Booking"("writerId", "startTime");

-- CreateIndex
CREATE INDEX "Booking_photographerId_startTime_idx" ON "Booking"("photographerId", "startTime");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_writerId_fkey" FOREIGN KEY ("writerId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
