import { redirect } from "next/navigation";
import { getGoogleAuthUrl } from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";

async function connectGoogle() {
  "use server";

  redirect(getGoogleAuthUrl("signup"));
}

export default async function GoogleConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const params = await searchParams;
  const isConnected = params.google === "connected";

  return (
    <main className="min-h-screen bg-[#f4f0e8] px-6 py-10 text-[#1f2a24]">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className={`rounded-[1.5rem] p-8 text-white shadow-xl ${isConnected ? "bg-[#2f6f45]" : "bg-[#12382b]"}`}>
          <p className="text-sm uppercase tracking-[0.3em] text-[#d7efc8]">Google Calendar</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">
            {isConnected ? "Your Google account is connected" : "Connect your account"}
          </h1>
          {isConnected ? (
            <p className="mt-3 text-white/85">
              You are all set. An admin can now assign your scheduling role, and you can close this tab.
            </p>
          ) : (
            <p className="mt-3 text-white/75">
              Authorize Google Calendar access. After approval, an admin can assign your scheduling role.
            </p>
          )}
        </header>

        {params.google && !isConnected ? (
          <div className="rounded-2xl border border-[#d8c7a3] bg-white px-5 py-4 text-sm font-medium">
            Google Calendar status: {params.google.replaceAll("_", " ")}
          </div>
        ) : null}

        {isConnected ? (
          <section className="rounded-[1.5rem] border border-[#9fcf9f] bg-white p-6 shadow-lg">
            <p className="text-lg font-black text-[#2f6f45]">Connection complete</p>
            <p className="mt-2 font-medium text-[#4f5f52]">
              Your Google Calendar authorization was saved successfully.
            </p>
          </section>
        ) : (
          <form action={connectGoogle} className="grid gap-4 rounded-[1.5rem] bg-white p-6 shadow-lg">
            <button className="w-fit rounded-xl bg-[#12382b] px-5 py-3 font-bold text-white">Connect Google</button>
          </form>
        )}
      </div>
    </main>
  );
}
