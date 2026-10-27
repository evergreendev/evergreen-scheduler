import "server-only";

import { Prisma, type TeamMember } from "@prisma/client";
import { randomUUID } from "crypto";
import { buildPublicRescheduleUrl, cancelBookingGoogleEvent } from "@/lib/bookingReschedule";
import { getMinimumBookingStartTime, MIN_BOOKING_LEAD_HOURS } from "@/lib/bookingRules";
import { getBookingSettings, renderBookingDetails, renderBookingTemplate } from "@/lib/bookingSettings";
import { createCalendarEvent, deleteCalendarEvent, getFreeBusy } from "@/lib/googleCalendar";
import { prisma } from "@/lib/prisma";
import { getActiveNotificationOrganizer, serializableTransactionOptions, SLOT_MINUTES } from "@/lib/scheduling";

type AssignedMember = Pick<
  TeamMember,
  "id" | "name" | "email" | "secondaryEmail" | "googleRefreshToken" | "googleCalendarId"
>;

export class BookingTimeUpdateError extends Error {}

export async function updateBookingTime(bookingId: string, startTime: Date) {
  if (!bookingId || Number.isNaN(startTime.getTime())) {
    throw new BookingTimeUpdateError("Choose a valid new date and time.");
  }

  const endTime = new Date(startTime.getTime() + SLOT_MINUTES * 60_000);
  const [booking, settings, notificationOrganizer] = await Promise.all([
    prisma.booking.findUnique({
      where: { id: bookingId },
      include: { writer: true, photographer: true },
    }),
    getBookingSettings(),
    getActiveNotificationOrganizer(),
  ]);

  if (!booking) throw new BookingTimeUpdateError("That booking no longer exists.");
  if (startTime < getMinimumBookingStartTime()) {
    throw new BookingTimeUpdateError(`Bookings must be at least ${MIN_BOOKING_LEAD_HOURS} hours in the future.`);
  }
  if (!booking.writer || !booking.photographer) {
    throw new BookingTimeUpdateError("This booking must have an assigned writer and photographer before its time can be changed.");
  }
  if (!notificationOrganizer) {
    throw new BookingTimeUpdateError("No connected Google Calendar is available to send the replacement invitation.");
  }
  if (settings.bookingEndDate && startTime > settings.bookingEndDate) {
    throw new BookingTimeUpdateError("Bookings are not available after the booking end date.");
  }
  if (booking.startTime.getTime() === startTime.getTime()) return booking;

  const assignedMembers: [AssignedMember, AssignedMember] = [booking.writer, booking.photographer];
  const rescheduleToken = booking.rescheduleToken ?? randomUUID();
  const rescheduleUrl = buildPublicRescheduleUrl(rescheduleToken);
  const createEventAt = async (eventStartTime: Date, eventEndTime: Date) => {
    const templateValues = {
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerFirstName: booking.customerFirstName,
      customerLastName: booking.customerLastName,
      customerPhone: booking.customerPhone,
      photoshootLocation: booking.photoshootLocation,
      peopleCount: booking.peopleCount,
      interviewSubject: booking.interviewSubject,
      notes: booking.notes,
      startTime: eventStartTime,
      endTime: eventEndTime,
    };

    return createCalendarEvent({
      assignedMembers,
      organizer: notificationOrganizer,
      customer: { name: booking.customerName, email: booking.customerEmail },
      title: renderBookingTemplate(settings.eventTitle, templateValues),
      description: [
        renderBookingTemplate(settings.eventDescription, templateValues),
        renderBookingDetails(templateValues),
        `Reschedule this booking: ${rescheduleUrl}`,
      ].filter(Boolean).join("\n\n"),
      rescheduleUrl,
      location: booking.photoshootLocation,
      startTime: eventStartTime,
      endTime: eventEndTime,
    });
  };

  const restoreOriginalEvent = async (failure: unknown) => {
    try {
      const restoredEventId = await createEventAt(booking.startTime, booking.endTime);
      await prisma.booking.update({
        where: { id: booking.id },
        data: { googleEventId: restoredEventId, rescheduleToken },
      });
    } catch (restoreError) {
      console.error("Unable to recreate the original calendar event after time update failure.", restoreError);
      throw new BookingTimeUpdateError(
        "The time update failed, and the original calendar invitation could not be restored. Please recreate it manually.",
      );
    }

    throw failure;
  };

  // Cancel first so this booking's existing event does not make its assigned team look busy.
  const originalEventCanceled = await cancelBookingGoogleEvent(booking);

  if (originalEventCanceled) {
    try {
      await prisma.booking.update({ where: { id: booking.id }, data: { googleEventId: null } });
    } catch (error) {
      return restoreOriginalEvent(error);
    }
  }

  let newEventId: string | null = null;

  try {
    const [busyBlocks, localConflict] = await Promise.all([
      getFreeBusy(assignedMembers, startTime, endTime),
      prisma.booking.findFirst({
        where: {
          id: { not: booking.id },
          OR: [{ writerId: booking.writer.id }, { photographerId: booking.photographer.id }],
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        select: { id: true },
      }),
    ]);
    const externallyBusy = busyBlocks.some(({ busy }) =>
      busy.some((block) => startTime < block.end && block.start < endTime),
    );
    if (externallyBusy || localConflict) {
      throw new BookingTimeUpdateError("The assigned writer or photographer is not available at that time.");
    }

    newEventId = await createEventAt(startTime, endTime);

    const updated = await prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          id: { not: booking.id },
          OR: [{ writerId: booking.writer!.id }, { photographerId: booking.photographer!.id }],
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        select: { id: true },
      });
      if (conflict) throw new BookingTimeUpdateError("The assigned writer or photographer is not available at that time.");

      return tx.booking.update({
        where: { id: booking.id },
        data: { startTime, endTime, googleEventId: newEventId, rescheduleToken },
      });
    }, serializableTransactionOptions);

    return updated;
  } catch (error) {
    if (newEventId) {
      await deleteCalendarEvent(newEventId, [...assignedMembers, notificationOrganizer]).catch((cleanupError) => {
        console.error("Unable to remove replacement event after booking update failure.", cleanupError);
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      error = new BookingTimeUpdateError("That time was just booked. Please choose another time.");
    }
    if (originalEventCanceled) return restoreOriginalEvent(error);
    throw error;
  }
}
