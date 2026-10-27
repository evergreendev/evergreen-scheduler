import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { buildPublicRescheduleUrl, cancelBookingGoogleEvent } from "@/lib/bookingReschedule";
import { getMinimumBookingStartTime, MIN_BOOKING_LEAD_HOURS } from "@/lib/bookingRules";
import { getBookingSettings, renderBookingDetails, renderBookingTemplate } from "@/lib/bookingSettings";
import { createCalendarEvent, isGoogleApiTimeoutError } from "@/lib/googleCalendar";
import { isHubSpotConfigured, updateHubSpotCompanyProductionStatus } from "@/lib/hubspot";
import { prisma } from "@/lib/prisma";
import { getActiveNotificationOrganizer, selectMembersForSlot, serializableTransactionOptions, SLOT_MINUTES } from "@/lib/scheduling";

type BookingRequest = {
  customerFirstName?: string;
  customerLastName?: string;
  customerEmail?: string;
  customerPhone?: string;
  photoshootLocation?: string;
  peopleCount?: number | string;
  interviewSubject?: string;
  notes?: string;
  hubspotCompanyId?: string;
  rescheduleToken?: string;
  startTime?: string;
};

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BookingRequest;
    const customerFirstName = body.customerFirstName?.trim();
    const customerLastName = body.customerLastName?.trim();
    const customerEmail = body.customerEmail?.trim().toLowerCase();
    const customerPhone = body.customerPhone?.trim();
    const photoshootLocation = body.photoshootLocation?.trim();
    const peopleCount = Number(body.peopleCount);
    const interviewSubject = body.interviewSubject?.trim();
    const notes = body.notes?.trim() || null;
    const hubspotCompanyId = body.hubspotCompanyId?.trim() || null;
    const submittedRescheduleToken = body.rescheduleToken?.trim() || null;
    const startTime = body.startTime ? new Date(body.startTime) : null;
    const customerName = [customerFirstName, customerLastName].filter(Boolean).join(" ");
    const rescheduleToken = randomUUID();

    if (hubspotCompanyId && !isHubSpotConfigured()) {
      return NextResponse.json({ error: "HubSpot is not configured." }, { status: 500 });
    }

    if (
      !customerFirstName ||
      !customerLastName ||
      !customerEmail ||
      !isEmail(customerEmail) ||
      !customerPhone ||
      !photoshootLocation ||
      !Number.isInteger(peopleCount) ||
      peopleCount < 1 ||
      !interviewSubject ||
      !startTime ||
      Number.isNaN(startTime.getTime())
    ) {
      return NextResponse.json(
        {
          error:
            "First name, last name, valid email address, phone number, photoshoot location, people count, interview subject, and startTime are required.",
        },
        { status: 400 },
      );
    }

    const endTime = new Date(startTime.getTime() + SLOT_MINUTES * 60_000);

    if (startTime < getMinimumBookingStartTime()) {
      return NextResponse.json({ error: `Bookings must be at least ${MIN_BOOKING_LEAD_HOURS} hours in the future.` }, { status: 400 });
    }

    const settings = await getBookingSettings();
    const rescheduledBooking = submittedRescheduleToken
      ? await prisma.booking.findUnique({
          where: { rescheduleToken: submittedRescheduleToken },
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
        })
      : null;

    if (submittedRescheduleToken && !rescheduledBooking) {
      return NextResponse.json({ error: "That reschedule link is no longer valid." }, { status: 404 });
    }

    if (settings.bookingEndDate && startTime > settings.bookingEndDate) {
      return NextResponse.json({ error: "Bookings are not available after the booking end date." }, { status: 400 });
    }

    const templateValues = {
      customerName,
      customerEmail,
      customerFirstName,
      customerLastName,
      customerPhone,
      photoshootLocation,
      peopleCount,
      interviewSubject,
      notes,
      startTime,
      endTime,
    };
    const eventTitle = renderBookingTemplate(settings.eventTitle, templateValues);
    const rescheduleUrl = buildPublicRescheduleUrl(rescheduleToken);
    const eventDescription = [
      renderBookingTemplate(settings.eventDescription, templateValues),
      renderBookingDetails(templateValues),
      `Reschedule this booking: ${rescheduleUrl}`,
    ].filter(Boolean).join("\n\n");

    // Re-query Google FreeBusy at booking time so stale UI availability cannot create a booking.
    const [assigned, notificationOrganizer] = await Promise.all([
      selectMembersForSlot(startTime, endTime),
      getActiveNotificationOrganizer(),
    ]);

    if (!assigned || !notificationOrganizer) {
      return NextResponse.json({ error: "That slot is no longer available." }, { status: 409 });
    }

    const booking = await prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          OR: [{ writerId: assigned.writer.id }, { photographerId: assigned.photographer.id }],
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        select: { id: true },
      });

      if (conflict) {
        throw new Error("BOOKING_CONFLICT");
      }

      return tx.booking.create({
        data: {
          customerName,
          customerEmail,
          customerFirstName,
          customerLastName,
          customerPhone,
          photoshootLocation,
          peopleCount,
          interviewSubject,
          notes,
          startTime,
          endTime,
          writerId: assigned.writer.id,
          photographerId: assigned.photographer.id,
          rescheduleToken,
        },
      });
    }, serializableTransactionOptions);

    try {
      const eventId = await createCalendarEvent({
        assignedMembers: [assigned.writer, assigned.photographer],
        organizer: notificationOrganizer,
        customer: { name: customerName, email: customerEmail },
        title: eventTitle,
        description: eventDescription,
        rescheduleUrl,
        location: photoshootLocation,
        startTime,
        endTime,
      });

      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: { googleEventId: eventId },
        });

        await tx.teamMember.updateMany({
          where: { id: { in: [assigned.writer.id, assigned.photographer.id] } },
          data: { lastBookedAt: new Date() },
        });
      });
    } catch (error) {
      await prisma.booking.delete({ where: { id: booking.id } }).catch((deleteError) => {
        console.error("Unable to roll back booking after Google Calendar failure.", deleteError);
      });
      throw error;
    }

    let rescheduledEventCanceled = false;

    if (rescheduledBooking) {
      try {
        rescheduledEventCanceled = await cancelBookingGoogleEvent(rescheduledBooking);

        if (rescheduledEventCanceled) {
          await prisma.booking.update({
            where: { id: rescheduledBooking.id },
            data: { googleEventId: null },
          });
        }
      } catch (error) {
        console.error("Unable to cancel previous Google Calendar event after reschedule.", error);
      }
    }

    let hubspotUpdated = false;

    if (hubspotCompanyId) {
      try {
        await updateHubSpotCompanyProductionStatus(hubspotCompanyId);
        hubspotUpdated = true;
      } catch (error) {
        console.error("Unable to update HubSpot company production status.", error);
      }
    }

    return NextResponse.json({ bookingId: booking.id, hubspotUpdated, rescheduledEventCanceled }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "BOOKING_CONFLICT") {
      return NextResponse.json({ error: "That slot is no longer available." }, { status: 409 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "That slot is being booked by someone else. Please try another time." }, { status: 409 });
    }

    if (isGoogleApiTimeoutError(error)) {
      return NextResponse.json({ error: "Google Calendar timed out while creating the booking. Please try again." }, { status: 504 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to create booking." }, { status: 500 });
  }
}
