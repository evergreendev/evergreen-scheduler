import Link from "next/link";
import { BookingClient } from "./BookingClient";
import { getBookingSettings } from "@/lib/bookingSettings";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const settings = await getBookingSettings();

  return (
    <main className="min-h-screen bg-[#f4f0e8] px-6 py-10 text-[#1f2a24]">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-[#4d7c59]">Evergreen Scheduler</p>
            <h1 className="mt-3 max-w-3xl text-5xl font-black tracking-tight md:text-7xl">{settings.eventTitle}</h1>
          </div>
          <Link href="/admin/team" className="rounded-full border border-[#12382b] px-5 py-3 font-bold text-[#12382b]">
            Admin team
          </Link>
        </header>
        <BookingClient />
      </div>
    </main>
  );
}
