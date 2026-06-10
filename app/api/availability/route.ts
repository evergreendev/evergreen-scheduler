import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/scheduling";

const MAX_RANGE_DAYS = 14;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");

    if (!startParam || !endParam) {
      return NextResponse.json({ error: "start and end query parameters are required." }, { status: 400 });
    }

    const start = new Date(startParam);
    const end = new Date(endParam);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
    }

    if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: `Date range cannot exceed ${MAX_RANGE_DAYS} days.` }, { status: 400 });
    }

    const slots = await getAvailableSlots(start, end);
    return NextResponse.json({ slots });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load availability." }, { status: 500 });
  }
}
