"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getMinimumBookingStartTime, MIN_BOOKING_LEAD_HOURS } from "@/lib/bookingRules";

type Slot = {
  start: string;
  end: string;
};

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

export function BookingClient() {
  const today = useMemo(() => new Date(), []);
  const minimumBookingStart = useMemo(() => getMinimumBookingStartTime(today), [today]);

  const [selectedDate, setSelectedDate] = useState("");
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(today));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [photoshootLocation, setPhotoshootLocation] = useState("");
  const [peopleCount, setPeopleCount] = useState("");
  const [interviewSubject, setInterviewSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

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

  async function reloadAvailability() {
    const range = getVisibleRange(visibleMonth, minimumBookingStart);
    const nextSlots = await fetchAvailability(range.start, range.end);
    setSlots(nextSlots);
    setSelectedDate(nextSlots[0] ? toLocalDateKey(new Date(nextSlots[0].start)) : "");
    setSelectedSlot("");
    setStatus(nextSlots.length ? null : "No matching writer + photographer slots were found.");
  }

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
          startTime: selectedSlot,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to create booking.");
      }

      setCustomerFirstName("");
      setCustomerLastName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setPhotoshootLocation("");
      setPeopleCount("");
      setInterviewSubject("");
      setNotes("");
      await reloadAvailability();
      setStatus("Booking confirmed. Calendar invitations have been sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create booking.");
    } finally {
      setLoading(false);
    }
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
        <p className="mt-3 text-sm leading-6 text-white/75">
          Dates are enabled only when at least one active writer and one active photographer are both free. Bookings must be at least {MIN_BOOKING_LEAD_HOURS} hours in the future.
        </p>

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
