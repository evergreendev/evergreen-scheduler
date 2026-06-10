"use client";

import { FormEvent, useMemo, useState } from "react";

type Slot = {
  start: string;
  end: string;
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function endOfLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

export function BookingClient() {
  const today = useMemo(() => new Date(), []);
  const weekOut = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date;
  }, []);

  const [startDate, setStartDate] = useState(toDateInputValue(today));
  const [endDate, setEndDate] = useState(toDateInputValue(weekOut));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function loadAvailability() {
    setLoading(true);
    setStatus(null);
    setSelectedSlot("");

    try {
      const params = new URLSearchParams({
        start: startOfLocalDate(startDate).toISOString(),
        end: endOfLocalDate(endDate).toISOString(),
      });
      const response = await fetch(`/api/availability?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load availability.");
      }

      setSlots(data.slots ?? []);
      setStatus(data.slots?.length ? null : "No matching writer + photographer slots were found.");
    } catch (error) {
      setSlots([]);
      setStatus(error instanceof Error ? error.message : "Unable to load availability.");
    } finally {
      setLoading(false);
    }
  }

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
        body: JSON.stringify({ customerName, customerEmail, startTime: selectedSlot }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to create booking.");
      }

      setStatus("Booking confirmed. Calendar invitations have been sent.");
      setCustomerName("");
      setCustomerEmail("");
      await loadAvailability();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create booking.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="rounded-[2rem] bg-[#12382b] p-6 text-white shadow-xl">
        <h2 className="text-2xl font-black">Find a role-covered slot</h2>
        <p className="mt-3 text-sm leading-6 text-white/75">
          A time appears only when at least one active writer and one active photographer are both free.
        </p>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-bold">
            Start date
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-xl px-4 py-3 text-[#1f2a24]" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            End date
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-xl px-4 py-3 text-[#1f2a24]" />
          </label>
          <button onClick={loadAvailability} disabled={loading} className="rounded-xl bg-[#f7c948] px-5 py-3 font-black text-[#12382b] disabled:opacity-60">
            {loading ? "Loading..." : "Show available times"}
          </button>
        </div>

        {status ? <p className="mt-5 rounded-xl bg-white/10 p-4 text-sm">{status}</p> : null}
      </aside>

      <section className="rounded-[2rem] bg-white p-6 shadow-xl">
        <h2 className="text-2xl font-black text-[#1f2a24]">Available 30-minute slots</h2>
        <div className="mt-5 grid max-h-[360px] gap-3 overflow-auto pr-2 sm:grid-cols-2 xl:grid-cols-3">
          {slots.map((slot) => {
            const label = new Intl.DateTimeFormat(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
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
        </div>

        <form onSubmit={bookSlot} className="mt-8 grid gap-4 rounded-[1.5rem] bg-[#f4f0e8] p-5">
          <h3 className="text-xl font-black text-[#1f2a24]">Book selected time</h3>
          <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required placeholder="Your name" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
          <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} required type="email" placeholder="Your email" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
          <button disabled={loading || !selectedSlot} className="rounded-xl bg-[#1f2a24] px-5 py-3 font-black text-white disabled:opacity-60">
            Confirm booking
          </button>
        </form>
      </section>
    </div>
  );
}
