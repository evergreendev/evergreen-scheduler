import "server-only";

import type { Booking, TeamMember } from "@prisma/client";
import { getBaseUrl } from "@/lib/env";
import { deleteCalendarEvent } from "@/lib/googleCalendar";
import { prisma } from "@/lib/prisma";
import { getActiveNotificationOrganizer } from "@/lib/scheduling";

type BookingPrefillFields = Pick<
  Booking,
  | "customerFirstName"
  | "customerLastName"
  | "customerEmail"
  | "customerPhone"
  | "photoshootLocation"
  | "peopleCount"
  | "interviewSubject"
  | "notes"
  | "rescheduleToken"
>;

type CalendarOwner = Pick<TeamMember, "googleRefreshToken" | "googleCalendarId"> | null | undefined;

export function buildBookingPrefillPath(booking: BookingPrefillFields) {
  const params = new URLSearchParams({
    customerFirstName: booking.customerFirstName,
    customerLastName: booking.customerLastName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    photoshootLocation: booking.photoshootLocation,
    peopleCount: String(booking.peopleCount),
    interviewSubject: booking.interviewSubject,
  });

  if (booking.notes) {
    params.set("notes", booking.notes);
  }

  if (booking.rescheduleToken) {
    params.set("rescheduleToken", booking.rescheduleToken);
  }

  return `/book?${params.toString()}`;
}

export function buildPublicRescheduleUrl(rescheduleToken: string) {
  return `${getBaseUrl()}/book/reschedule/${encodeURIComponent(rescheduleToken)}`;
}

export async function cancelBookingGoogleEvent(booking: {
  googleEventId: string | null;
  writer?: CalendarOwner;
  photographer?: CalendarOwner;
}) {
  if (!booking.googleEventId) {
    return false;
  }

  const [fallbackOrganizer, connectedCalendarOwners] = await Promise.all([
    getActiveNotificationOrganizer(),
    prisma.teamMember.findMany({
      where: {
        googleRefreshToken: { not: null },
      },
      select: {
        googleRefreshToken: true,
        googleCalendarId: true,
      },
    }),
  ]);

  await deleteCalendarEvent(booking.googleEventId, [
    booking.writer,
    booking.photographer,
    fallbackOrganizer,
    ...connectedCalendarOwners,
  ]);

  return true;
}
