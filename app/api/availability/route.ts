import { NextResponse } from "next/server";
import { getMinimumBookingStartTime } from "@/lib/bookingRules";
import { getBookingSettings } from "@/lib/bookingSettings";
import { getAvailableSlots } from "@/lib/scheduling";

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");

    if (!startParam || !endParam) {
      return NextResponse.json({ error: "start and end query parameters are required." }, { status: 400 });
    }

    const requestedStart = parseDateInput(startParam);
    const end = parseDateInput(endParam);

    if (!requestedStart || !end) {
      return NextResponse.json({ error: "Invalid calendar dates." }, { status: 400 });
    }

    const start = new Date(Math.max(requestedStart.getTime(), getMinimumBookingStartTime().getTime()));
    const settings = await getBookingSettings();
    const constrainedEnd = settings.bookingEndDate && settings.bookingEndDate < end ? settings.bookingEndDate : end;

    if (start >= constrainedEnd) {
      return NextResponse.json({ slots: [] });
    }

    const slots = await getAvailableSlots(start, constrainedEnd);
    return NextResponse.json({ slots });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load availability." }, { status: 500 });
  }
}
