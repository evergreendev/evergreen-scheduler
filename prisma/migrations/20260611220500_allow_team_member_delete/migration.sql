ALTER TABLE "Booking" DROP CONSTRAINT "Booking_writerId_fkey";
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_photographerId_fkey";

ALTER TABLE "Booking"
ALTER COLUMN "writerId" DROP NOT NULL,
ALTER COLUMN "photographerId" DROP NOT NULL;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_writerId_fkey"
FOREIGN KEY ("writerId") REFERENCES "TeamMember"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_photographerId_fkey"
FOREIGN KEY ("photographerId") REFERENCES "TeamMember"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
