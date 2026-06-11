import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getBookingSettings, renderBookingTemplate } from "@/lib/bookingSettings";
import { createCalendarEvent } from "@/lib/googleCalendar";
import { prisma } from "@/lib/prisma";
import { selectMembersForSlot, serializableTransactionOptions, SLOT_MINUTES } from "@/lib/scheduling";

type BookingRequest = {
  customerFirstName?: string;
  customerLastName?: string;
  customerEmail?: string;
  customerPhone?: string;
  photoshootLocation?: string;
  peopleCount?: number | string;
  interviewSubject?: string;
  notes?: string;
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
    const startTime = body.startTime ? new Date(body.startTime) : null;
    const customerName = [customerFirstName, customerLastName].filter(Boolean).join(" ");

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
    const settings = await getBookingSettings();
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
    const eventDescription = renderBookingTemplate(settings.eventDescription, templateValues);

    // Re-query Google FreeBusy at booking time so stale UI availability cannot create a booking.
    const assigned = await selectMembersForSlot(startTime, endTime);

    if (!assigned) {
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

      const eventId = await createCalendarEvent({
        assignedMembers: [assigned.writer, assigned.photographer],
        customer: { name: customerName, email: customerEmail },
        title: eventTitle,
        description: eventDescription,
        startTime,
        endTime,
      });

      const created = await tx.booking.create({
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
          googleEventId: eventId,
        },
      });

      await tx.teamMember.updateMany({
        where: { id: { in: [assigned.writer.id, assigned.photographer.id] } },
        data: { lastBookedAt: new Date() },
      });

      return created;
    }, serializableTransactionOptions);

    return NextResponse.json({ bookingId: booking.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "BOOKING_CONFLICT") {
      return NextResponse.json({ error: "That slot is no longer available." }, { status: 409 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "That slot is being booked by someone else. Please try another time." }, { status: 409 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to create booking." }, { status: 500 });
  }
}
