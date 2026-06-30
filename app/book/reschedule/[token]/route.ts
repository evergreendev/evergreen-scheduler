import { NextResponse } from "next/server";
import { buildBookingPrefillPath, cancelBookingGoogleEvent } from "@/lib/bookingReschedule";
import { getBaseUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const booking = await prisma.booking.findUnique({
    where: { rescheduleToken: token },
    include: {
      writer: {
        select: {
          googleRefreshToken: true,
          googleCalendarId: true,
        },
      },
      photographer: {
        select: {
          googleRefreshToken: true,
          googleCalendarId: true,
        },
      },
    },
  });

  if (!booking) {
    return NextResponse.redirect(`${getBaseUrl()}/book`);
  }

  await cancelBookingGoogleEvent(booking);
  await prisma.booking.update({
    where: { id: booking.id },
    data: { googleEventId: null },
  });

  return NextResponse.redirect(`${getBaseUrl()}${buildBookingPrefillPath(booking)}`);
}
