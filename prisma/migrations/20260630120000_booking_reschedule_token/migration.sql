ALTER TABLE "Booking"
ADD COLUMN "rescheduleToken" TEXT;

CREATE UNIQUE INDEX "Booking_rescheduleToken_key" ON "Booking"("rescheduleToken");
