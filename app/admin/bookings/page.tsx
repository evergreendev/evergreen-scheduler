import Link from "next/link";
import { requireAdminPage } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCreatedDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
}

export default async function AdminBookingsPage() {
  await requireAdminPage();

  const bookings = await prisma.booking.findMany({
    orderBy: [{ startTime: "desc" }, { createdAt: "desc" }],
    include: {
      writer: {
        select: {
          name: true,
          email: true,
          secondaryEmail: true,
        },
      },
      photographer: {
        select: {
          name: true,
          email: true,
          secondaryEmail: true,
        },
      },
    },
  });

  return (
    <main className="min-h-screen bg-[#f4f0e8] px-6 py-10 text-[#1f2a24]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-[2rem] bg-[#12382b] p-8 text-white shadow-xl md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-[#b5d99c]">Admin</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Bookings</h1>
            <p className="mt-3 max-w-2xl text-white/75">
              Review every interview and photoshoot booking submitted through the scheduler.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/team" className="rounded-full border border-white/30 px-5 py-3 font-bold text-white transition hover:bg-white/10">
              Team setup
            </Link>
            <Link href="/book" className="rounded-full bg-[#f7c948] px-5 py-3 font-bold text-[#12382b] transition hover:bg-[#ffd866]">
              View booking page
            </Link>
          </div>
        </header>

        <section className="grid gap-4">
          {bookings.map((booking) => (
            <article key={booking.id} className="rounded-[1.5rem] bg-white p-5 shadow-md">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-[#4d7c59]">
                    {formatDateTime(booking.startTime)} - {formatDateTime(booking.endTime)}
                  </p>
                  <h2 className="mt-2 text-2xl font-black">{booking.customerName}</h2>
                  <p className="mt-1 text-sm font-semibold text-[#5f665f]">
                    Booked {formatCreatedDate(booking.createdAt)}
                  </p>
                </div>
                <span className="w-fit rounded-full bg-[#f4f0e8] px-4 py-2 text-sm font-black text-[#12382b]">
                  {booking.googleEventId ? "Calendar event sent" : "No calendar event"}
                </span>
              </div>

              <div className="mt-5 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <p className="font-black text-[#5f665f]">Customer</p>
                  <p className="mt-1 font-semibold">{booking.customerEmail}</p>
                  <p className="font-semibold">{booking.customerPhone}</p>
                </div>
                <div>
                  <p className="font-black text-[#5f665f]">Photoshoot</p>
                  <p className="mt-1 font-semibold">{booking.photoshootLocation}</p>
                  <p className="font-semibold">{booking.peopleCount} people</p>
                </div>
                <div>
                  <p className="font-black text-[#5f665f]">Interview subject</p>
                  <p className="mt-1 font-semibold">{booking.interviewSubject}</p>
                </div>
                <div>
                  <p className="font-black text-[#5f665f]">Writer</p>
                  <p className="mt-1 font-semibold">{booking.writer?.name ?? "Unassigned"}</p>
                  {booking.writer ? (
                    <p className="text-[#5f665f]">
                      {[booking.writer.email, booking.writer.secondaryEmail].filter(Boolean).join(", ")}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="font-black text-[#5f665f]">Photographer</p>
                  <p className="mt-1 font-semibold">{booking.photographer?.name ?? "Unassigned"}</p>
                  {booking.photographer ? (
                    <p className="text-[#5f665f]">
                      {[booking.photographer.email, booking.photographer.secondaryEmail].filter(Boolean).join(", ")}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="font-black text-[#5f665f]">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap font-semibold">{booking.notes || "None"}</p>
                </div>
              </div>
            </article>
          ))}

          {bookings.length === 0 ? (
            <div className="rounded-[1.5rem] bg-white p-8 text-center text-[#6f6a5f] shadow-md">
              No bookings have been submitted yet.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
