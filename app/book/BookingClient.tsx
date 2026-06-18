"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getMinimumBookingStartTime } from "@/lib/bookingRules";

type Slot = {
  start: string;
  end: string;
};

type ConfirmedBooking = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  photoshootLocation: string;
  peopleCount: string;
  interviewSubject: string;
  notes: string;
  startTime: string;
  endTime: string;
  calendarHref: string;
};

export type BookingFormInitialValues = Partial<{
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string;
  photoshootLocation: string;
  peopleCount: string;
  interviewSubject: string;
  notes: string;
  hubspotCompanyId: string;
}>;

const BOOKING_EMAIL_REMINDER_HOURS = 7;
const BOOKING_FINAL_REMINDER_MINUTES = 30;

function escapeIcsText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/g, "\\n");
}

function toIcsDate(date: Date) {
  return date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
}

function buildCalendarHref(details: Omit<ConfirmedBooking, "calendarHref">) {
  const description = [
    `Customer: ${details.customerName}`,
    `Customer email: ${details.customerEmail}`,
    `Customer phone: ${details.customerPhone}`,
    `Photoshoot location: ${details.photoshootLocation}`,
    `People count: ${details.peopleCount}`,
    `Interview subject: ${details.interviewSubject}`,
    `Notes: ${details.notes || "None"}`,
  ].join("\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Evergreen Scheduler//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@evergreen-scheduler`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(new Date(details.startTime))}`,
    `DTEND:${toIcsDate(new Date(details.endTime))}`,
    `SUMMARY:${escapeIcsText(`Interview and photoshoot with ${details.customerName}`)}`,
    `LOCATION:${escapeIcsText(details.photoshootLocation)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "BEGIN:VALARM",
    `TRIGGER:-PT${BOOKING_EMAIL_REMINDER_HOURS}H`,
    "ACTION:EMAIL",
    `ATTENDEE:mailto:${details.customerEmail}`,
    `SUMMARY:${escapeIcsText(`Reminder: Interview and photoshoot with ${details.customerName}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VALARM",
    "BEGIN:VALARM",
    `TRIGGER:-PT${BOOKING_FINAL_REMINDER_MINUTES}M`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(`Interview and photoshoot with ${details.customerName} starts in 30 minutes.`)}`,
    "END:VALARM",
    "BEGIN:VALARM",
    `TRIGGER:-PT${BOOKING_FINAL_REMINDER_MINUTES}M`,
    "ACTION:EMAIL",
    `ATTENDEE:mailto:${details.customerEmail}`,
    `SUMMARY:${escapeIcsText(`Reminder: Interview and photoshoot with ${details.customerName}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getCalendarDays(month: Date) {
  const first = startOfMonth(month);
  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - cursor.getDay());

  return Array.from({ length: 42 }, () => {
    const date = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
    return date;
  });
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function fetchAvailability(start: string, end: string) {
  const params = new URLSearchParams({ start, end });
  const response = await fetch(`/api/availability?${params.toString()}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Unable to load availability.");
  }

  return (data.slots ?? []) as Slot[];
}

function getVisibleRange(month: Date, minimumBookingStart: Date) {
  const days = getCalendarDays(month);
  const start = new Date(Math.max(days[0].getTime(), minimumBookingStart.getTime()));
  const end = addDays(days[days.length - 1], 1);

  return {
    start: toLocalDateKey(start),
    end: toLocalDateKey(end),
  };
}

export function BookingClient({ initialValues = {} }: { initialValues?: BookingFormInitialValues }) {
  const today = useMemo(() => new Date(), []);
  const minimumBookingStart = useMemo(() => getMinimumBookingStartTime(today), [today]);

  const [selectedDate, setSelectedDate] = useState("");
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(today));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [customerFirstName, setCustomerFirstName] = useState(initialValues.customerFirstName ?? "");
  const [customerLastName, setCustomerLastName] = useState(initialValues.customerLastName ?? "");
  const [customerEmail, setCustomerEmail] = useState(initialValues.customerEmail ?? "");
  const [customerPhone, setCustomerPhone] = useState(initialValues.customerPhone ?? "");
  const [photoshootLocation, setPhotoshootLocation] = useState(initialValues.photoshootLocation ?? "");
  const [peopleCount, setPeopleCount] = useState(initialValues.peopleCount ?? "");
  const [interviewSubject, setInterviewSubject] = useState(initialValues.interviewSubject ?? "");
  const [notes, setNotes] = useState(initialValues.notes ?? "");
  const [hubspotCompanyId] = useState(initialValues.hubspotCompanyId ?? "");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  useEffect(() => {
    let canceled = false;
    const range = getVisibleRange(visibleMonth, minimumBookingStart);

    fetchAvailability(range.start, range.end)
      .then((nextSlots) => {
        if (canceled) return;
        const nextSelectedDate = nextSlots[0] ? toLocalDateKey(new Date(nextSlots[0].start)) : "";
        setSlots(nextSlots);
        setSelectedDate(nextSelectedDate);
        setSelectedSlot("");
        setStatus(nextSlots.length ? null : "No matching writer + photographer slots were found.");
      })
      .catch((error) => {
        if (canceled) return;
        setSlots([]);
        setSelectedDate("");
        setStatus(error instanceof Error ? error.message : "Unable to load availability.");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [minimumBookingStart, visibleMonth]);

  const slotsByDate = useMemo(() => {
    return slots.reduce<Map<string, Slot[]>>((grouped, slot) => {
      const key = toLocalDateKey(new Date(slot.start));
      const current = grouped.get(key) ?? [];
      current.push(slot);
      grouped.set(key, current);
      return grouped;
    }, new Map());
  }, [slots]);

  const availableDateKeys = useMemo(() => new Set(slotsByDate.keys()), [slotsByDate]);
  const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);
  const selectedDateSlots = selectedDate ? slotsByDate.get(selectedDate) ?? [] : [];
  const selectedDateLabel = selectedDate
    ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${selectedDate}T00:00:00`))
    : "";

  async function bookSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSlot) {
      setStatus("Choose a time slot first.");
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerFirstName,
          customerLastName,
          customerEmail,
          customerPhone,
          photoshootLocation,
          peopleCount,
          interviewSubject,
          notes,
          hubspotCompanyId,
          startTime: selectedSlot,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to create booking.");
      }

      const startTime = new Date(selectedSlot);
      const endTime = new Date(startTime.getTime() + 45 * 60_000);
      const confirmationDetails = {
        customerName: [customerFirstName, customerLastName].filter(Boolean).join(" "),
        customerEmail,
        customerPhone,
        photoshootLocation,
        peopleCount,
        interviewSubject,
        notes,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      };

      setConfirmedBooking({
        ...confirmationDetails,
        calendarHref: buildCalendarHref(confirmationDetails),
      });
      setCustomerFirstName("");
      setCustomerLastName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setPhotoshootLocation("");
      setPeopleCount("");
      setInterviewSubject("");
      setNotes("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create booking.");
    } finally {
      setLoading(false);
    }
  }

  if (confirmedBooking) {
    const startLabel = new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(confirmedBooking.startTime));
    const endLabel = new Intl.DateTimeFormat(undefined, {
      timeStyle: "short",
    }).format(new Date(confirmedBooking.endTime));

    return (
      <section className="rounded-[2rem] bg-white p-8 shadow-xl">
        <div className="max-w-3xl">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-[#4d7c59]">Booking confirmed</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-[#1f2a24]">Your interview and photoshoot are scheduled.</h2>
          <p className="mt-4 text-lg leading-8 text-[#5f665f]">
            The event details have been sent to {confirmedBooking.customerEmail}. That email includes the interview and photoshoot
            information submitted with the booking.
          </p>

          <div className="mt-6 grid gap-3 rounded-[1.5rem] bg-[#f4f0e8] p-5 text-sm font-semibold text-[#1f2a24] sm:grid-cols-2">
            <div>
              <span className="block text-[#5f665f]">Date and time</span>
              <span className="mt-1 block text-base font-black">{startLabel} - {endLabel}</span>
            </div>
            <div>
              <span className="block text-[#5f665f]">Photoshoot location</span>
              <span className="mt-1 block text-base font-black">{confirmedBooking.photoshootLocation}</span>
            </div>
            <div>
              <span className="block text-[#5f665f]">People in shoot</span>
              <span className="mt-1 block text-base font-black">{confirmedBooking.peopleCount}</span>
            </div>
            <div>
              <span className="block text-[#5f665f]">Interview subject</span>
              <span className="mt-1 block text-base font-black">{confirmedBooking.interviewSubject}</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={confirmedBooking.calendarHref}
              download="evergreen-booking.ics"
              className="rounded-xl bg-[#1f2a24] px-5 py-3 font-black text-white"
            >
              Download calendar file
            </a>
{/*            <button
              type="button"
              onClick={() => {
                setConfirmedBooking(null);
                void reloadAvailability();
              }}
              className="rounded-xl border border-[#12382b] px-5 py-3 font-black text-[#12382b]"
            >
              Book another time
            </button>*/}
          </div>
          <p className="mt-3 text-sm font-medium text-[#5f665f]">
            Use the download for Outlook, Apple Calendar, iCal, or any calendar app that imports .ics files.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="rounded-[2rem] bg-[#12382b] p-6 text-white shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-black">Available dates</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setStatus(null);
                setVisibleMonth((month) => addMonths(month, -1));
              }}
              aria-label="Previous month"
              className="h-10 w-10 rounded-xl border border-white/20 bg-white/10 text-sm font-black text-white hover:bg-white/20"
            >
              {"<"}
            </button>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setStatus(null);
                setVisibleMonth((month) => addMonths(month, 1));
              }}
              aria-label="Next month"
              className="h-10 w-10 rounded-xl border border-white/20 bg-white/10 text-sm font-black text-white hover:bg-white/20"
            >
              {">"}
            </button>
          </div>
        </div>
{/*        <p className="mt-3 text-sm leading-6 text-white/75">
          Dates are enabled only when at least one active writer and one active photographer are both free. Bookings must be at least {MIN_BOOKING_LEAD_HOURS} hours in the future.
        </p>*/}

        <div className="mt-6 rounded-2xl bg-white/10 p-4">
          <div className="text-center text-lg font-black">
            {new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(visibleMonth)}
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-black uppercase text-white/60">
            {weekdayLabels.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const key = toLocalDateKey(day);
              const hasSlots = availableDateKeys.has(key);
              const isSelected = selectedDate === key;
              const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();

              return (
                <button
                  key={key}
                  type="button"
                  disabled={!hasSlots}
                  onClick={() => {
                    setSelectedDate(key);
                    setSelectedSlot("");
                    setStatus(null);
                  }}
                  className={`aspect-square rounded-xl text-sm font-black transition ${
                    isSelected
                      ? "bg-[#f7c948] text-[#12382b]"
                      : hasSlots
                        ? "bg-white text-[#12382b] hover:bg-[#f7c948]"
                        : isCurrentMonth
                          ? "bg-white/5 text-white/30"
                          : "bg-transparent text-white/15"
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          {loading ? <p className="mt-4 rounded-xl bg-white/10 p-3 text-sm">Loading available dates...</p> : null}
        </div>

        {status ? <p className="mt-5 rounded-xl bg-white/10 p-4 text-sm">{status}</p> : null}
      </aside>

      <section className="rounded-[2rem] bg-white p-6 shadow-xl">
        <h2 className="text-2xl font-black text-[#1f2a24]">
          {selectedDateLabel ? `Available 45-minute slots for ${selectedDateLabel}` : "Available 45-minute slots"}
        </h2>
        <div className="mt-5 grid max-h-[360px] gap-3 overflow-auto pr-2 sm:grid-cols-2 xl:grid-cols-3">
          {selectedDateSlots.map((slot) => {
            const label = new Intl.DateTimeFormat(undefined, {
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(slot.start));

            return (
              <button
                key={slot.start}
                onClick={() => setSelectedSlot(slot.start)}
                className={`rounded-2xl border px-4 py-3 text-left font-bold transition ${
                  selectedSlot === slot.start
                    ? "border-[#12382b] bg-[#12382b] text-white"
                    : "border-[#d8c7a3] bg-[#fbfaf6] text-[#1f2a24] hover:border-[#12382b]"
                }`}
              >
                {label}
              </button>
            );
          })}
          {!loading && selectedDate && selectedDateSlots.length === 0 ? (
            <p className="rounded-2xl border border-[#d8c7a3] bg-[#fbfaf6] px-4 py-3 text-sm font-bold text-[#5f665f]">
              Select an enabled date to see available times.
            </p>
          ) : null}
        </div>

        <form onSubmit={bookSlot} className="mt-8 grid gap-4 rounded-[1.5rem] bg-[#f4f0e8] p-5">
          <h3 className="text-xl font-black text-[#1f2a24]">Book selected time</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <input value={customerFirstName} onChange={(event) => setCustomerFirstName(event.target.value)} required placeholder="First name" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
            <input value={customerLastName} onChange={(event) => setCustomerLastName(event.target.value)} required placeholder="Last name" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} required type="email" placeholder="Email address" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
            <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} required type="tel" placeholder="Phone number" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
          </div>
          <input value={photoshootLocation} onChange={(event) => setPhotoshootLocation(event.target.value)} required placeholder="Location of photoshoot" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
          <input
            value={peopleCount}
            onChange={(event) => setPeopleCount(event.target.value)}
            required
            min={1}
            step={1}
            type="number"
            placeholder="How many people will be in the shoot?"
            className="rounded-xl border border-[#d8c7a3] px-4 py-3"
          />
          <input
            value={interviewSubject}
            onChange={(event) => setInterviewSubject(event.target.value)}
            required
            placeholder="Name of the person being interviewed and quoted in the article"
            className="rounded-xl border border-[#d8c7a3] px-4 py-3"
          />
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything else you'd like us to know? Optional"
            rows={3}
            className="resize-none rounded-xl border border-[#d8c7a3] px-4 py-3"
          />
          <button disabled={loading || !selectedSlot} className="rounded-xl bg-[#1f2a24] px-5 py-3 font-black text-white disabled:opacity-60">
            Confirm booking
          </button>
        </form>
      </section>
    </div>
  );
}
