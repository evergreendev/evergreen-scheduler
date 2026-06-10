import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

async function createTeamMember(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as Role;
  const googleCalendarId = String(formData.get("googleCalendarId") ?? "primary").trim() || "primary";

  if (!name || !email || !Object.values(Role).includes(role)) {
    return;
  }

  await prisma.teamMember.create({
    data: { name, email, role, googleCalendarId },
  });

  revalidatePath("/admin/team");
}

async function updateTeamMember(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as Role;
  const active = formData.get("active") === "on";
  const googleCalendarId = String(formData.get("googleCalendarId") ?? "primary").trim() || "primary";

  if (!id || !name || !email || !Object.values(Role).includes(role)) {
    return;
  }

  await prisma.teamMember.update({
    where: { id },
    data: { name, email, role, active, googleCalendarId },
  });

  revalidatePath("/admin/team");
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const params = await searchParams;
  const members = await prisma.teamMember.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <main className="min-h-screen bg-[#f4f0e8] px-6 py-10 text-[#1f2a24]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-[2rem] bg-[#12382b] p-8 text-white shadow-xl md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-[#b5d99c]">Admin</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Team calendar setup</h1>
            <p className="mt-3 max-w-2xl text-white/75">
              Add team members, set required roles, and connect each person&apos;s Google Calendar.
            </p>
          </div>
          <Link href="/book" className="rounded-full bg-[#f7c948] px-5 py-3 font-bold text-[#12382b] transition hover:bg-[#ffd866]">
            View booking page
          </Link>
        </header>

        {params.google ? (
          <div className="rounded-2xl border border-[#d8c7a3] bg-white px-5 py-4 text-sm font-medium">
            Google Calendar status: {params.google.replaceAll("_", " ")}
          </div>
        ) : null}

        <section className="rounded-[1.5rem] bg-white p-6 shadow-lg">
          <h2 className="text-2xl font-black">Add team member</h2>
          <form action={createTeamMember} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_180px_1fr_auto]">
            <input name="name" required placeholder="Name" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
            <input name="email" required type="email" placeholder="Email" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
            <select name="role" defaultValue={Role.WRITER} className="rounded-xl border border-[#d8c7a3] px-4 py-3">
              {Object.values(Role).map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <input name="googleCalendarId" placeholder="Calendar ID, defaults to primary" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
            <button className="rounded-xl bg-[#12382b] px-5 py-3 font-bold text-white">Add</button>
          </form>
        </section>

        <section className="grid gap-4">
          {members.map((member) => (
            <form key={member.id} action={updateTeamMember} className="grid gap-3 rounded-[1.5rem] bg-white p-5 shadow-md lg:grid-cols-[1fr_1fr_170px_1fr_110px_auto] lg:items-center">
              <input type="hidden" name="id" value={member.id} />
              <input name="name" defaultValue={member.name} className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
              <input name="email" type="email" defaultValue={member.email} className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
              <select name="role" defaultValue={member.role} className="rounded-xl border border-[#d8c7a3] px-4 py-3">
                {Object.values(Role).map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <input name="googleCalendarId" defaultValue={member.googleCalendarId} className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
              <label className="flex items-center gap-2 font-semibold">
                <input name="active" type="checkbox" defaultChecked={member.active} /> Active
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-xl bg-[#1f2a24] px-4 py-3 font-bold text-white">Save</button>
                <Link href={`/api/google/oauth/start?teamMemberId=${member.id}`} className="rounded-xl border border-[#12382b] px-4 py-3 font-bold text-[#12382b]">
                  {member.googleRefreshToken ? "Reconnect" : "Connect Google"}
                </Link>
              </div>
            </form>
          ))}

          {members.length === 0 ? (
            <div className="rounded-[1.5rem] bg-white p-8 text-center text-[#6f6a5f] shadow-md">
              No team members yet. Add at least one writer and one photographer.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
