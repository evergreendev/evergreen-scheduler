ALTER TABLE "Booking"
ADD COLUMN "customerFirstName" TEXT,
ADD COLUMN "customerLastName" TEXT,
ADD COLUMN "customerPhone" TEXT,
ADD COLUMN "photoshootLocation" TEXT,
ADD COLUMN "peopleCount" INTEGER,
ADD COLUMN "interviewSubject" TEXT,
ADD COLUMN "notes" TEXT;

UPDATE "Booking"
SET
  "customerFirstName" = COALESCE(NULLIF(split_part("customerName", ' ', 1), ''), "customerName"),
  "customerLastName" = COALESCE(NULLIF(trim(substr("customerName", length(split_part("customerName", ' ', 1)) + 1)), ''), 'Unknown'),
  "customerPhone" = 'Unknown',
  "photoshootLocation" = 'Unknown',
  "peopleCount" = 1,
  "interviewSubject" = 'Unknown'
WHERE "customerFirstName" IS NULL;

ALTER TABLE "Booking"
ALTER COLUMN "customerFirstName" SET NOT NULL,
ALTER COLUMN "customerLastName" SET NOT NULL,
ALTER COLUMN "customerPhone" SET NOT NULL,
ALTER COLUMN "photoshootLocation" SET NOT NULL,
ALTER COLUMN "peopleCount" SET NOT NULL,
ALTER COLUMN "interviewSubject" SET NOT NULL;
