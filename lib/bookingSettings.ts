import "server-only";

import { prisma } from "@/lib/prisma";

const SETTINGS_ID = "default";
const DEFAULT_EVENT_TITLE = "Booking with {customerName}";
const DEFAULT_EVENT_DESCRIPTION = "Created by Evergreen Scheduler.";

export async function getBookingSettings() {
  return prisma.schedulerSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      eventTitle: DEFAULT_EVENT_TITLE,
      eventDescription: DEFAULT_EVENT_DESCRIPTION,
    },
    update: {},
  });
}

export async function updateBookingSettings(eventTitle: string, eventDescription: string, bookingEndDate: Date | null) {
  return prisma.schedulerSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      eventTitle: eventTitle || DEFAULT_EVENT_TITLE,
      eventDescription: eventDescription || DEFAULT_EVENT_DESCRIPTION,
      bookingEndDate,
    },
    update: {
      eventTitle: eventTitle || DEFAULT_EVENT_TITLE,
      eventDescription: eventDescription || DEFAULT_EVENT_DESCRIPTION,
      bookingEndDate,
    },
  });
}

export function parseBookingEndDate(value: string) {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

export function toBookingEndDateInputValue(date: Date | null) {
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function renderBookingTemplate(
  template: string,
  values: {
    customerName: string;
    customerEmail: string;
    customerFirstName?: string;
    customerLastName?: string;
    customerPhone?: string;
    photoshootLocation?: string;
    peopleCount?: number;
    interviewSubject?: string;
    notes?: string | null;
    startTime: Date;
    endTime: Date;
  },
) {
  const startsAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(values.startTime);
  const endsAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(values.endTime);

  return template
    .replaceAll("{customerName}", values.customerName)
    .replaceAll("{customerEmail}", values.customerEmail)
    .replaceAll("{customerFirstName}", values.customerFirstName ?? "")
    .replaceAll("{customerLastName}", values.customerLastName ?? "")
    .replaceAll("{customerPhone}", values.customerPhone ?? "")
    .replaceAll("{photoshootLocation}", values.photoshootLocation ?? "")
    .replaceAll("{peopleCount}", String(values.peopleCount ?? ""))
    .replaceAll("{interviewSubject}", values.interviewSubject ?? "")
    .replaceAll("{notes}", values.notes ?? "")
    .replaceAll("{startTime}", startsAt)
    .replaceAll("{endTime}", endsAt);
}
