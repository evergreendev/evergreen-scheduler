import "server-only";

import type { Prisma } from "@prisma/client";
import { toBookingEndDateInputValue } from "@/lib/bookingSettings";
import { prisma } from "@/lib/prisma";

// Use the same local calendar dates as business hours and the booking end date.
// The end is exclusive, so a booking ending at midnight doesn't block on the next day.
export async function getBlackoutDatesForRange(
  start: Date,
  end: Date,
  db: Pick<Prisma.TransactionClient, "blackoutDate"> = prisma,
) {
  if (end <= start) return new Set<string>();

  const dates = await db.blackoutDate.findMany({
    where: {
      date: {
        gte: toBookingEndDateInputValue(start),
        lte: toBookingEndDateInputValue(new Date(end.getTime() - 1)),
      },
    },
    select: { date: true },
  });

  return new Set(dates.map(({ date }) => date));
}
