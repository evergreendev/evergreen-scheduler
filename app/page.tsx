import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#12382b] px-6 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-between rounded-[2.5rem] bg-[#f4f0e8] p-8 text-[#1f2a24] shadow-2xl md:p-12">
        <nav className="flex items-center justify-between">
          <span className="text-sm font-black uppercase tracking-[0.3em] text-[#4d7c59]">Evergreen</span>
          <Link href="/admin/team" className="rounded-full border border-[#12382b] px-5 py-2 font-bold">Admin</Link>
        </nav>

        <section className="py-16">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-[#4d7c59]">Role-based scheduling</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black leading-none tracking-tight md:text-8xl">
            Book only when every required role is covered.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#5f665f]">
            Customers see 30-minute slots only when at least one writer and one photographer are available through Google Calendar FreeBusy.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/book" className="rounded-full bg-[#f7c948] px-6 py-4 font-black text-[#12382b]">Open booking page</Link>
            <Link href="/admin/team" className="rounded-full bg-[#12382b] px-6 py-4 font-black text-white">Manage team</Link>
          </div>
        </section>

        <div className="grid gap-3 text-sm font-bold md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5">WRITER availability</div>
          <div className="rounded-2xl bg-white p-5">PHOTOGRAPHER availability</div>
          <div className="rounded-2xl bg-white p-5">Least-recent assignment</div>
        </div>
      </div>
    </main>
  );
}
