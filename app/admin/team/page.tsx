import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { requireAdminPage } from "@/lib/adminAuth";
import { getBookingSettings, parseBookingEndDate, toBookingEndDateInputValue, updateBookingSettings } from "@/lib/bookingSettings";
import { prisma } from "@/lib/prisma";
import { TeamPriorityList } from "@/app/admin/team/TeamPriorityList";

export const dynamic = "force-dynamic";

async function nextSortOrder(role: Role) {
  const lastMember = await prisma.teamMember.findFirst({
    where: { role },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return (lastMember?.sortOrder ?? -1) + 1;
}

function isRole(value: string): value is Role {
  return Object.values(Role).includes(value as Role);
}

async function createTeamMember(formData: FormData) {
  "use server";

  await requireAdminPage();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const secondaryEmail = String(formData.get("secondaryEmail") ?? "").trim().toLowerCase() || null;
  const role = String(formData.get("role") ?? "") as Role;
  const googleCalendarId = String(formData.get("googleCalendarId") ?? "primary").trim() || "primary";

  if (!name || !email || !isRole(role)) {
    return;
  }

  await prisma.teamMember.create({
    data: { name, email, secondaryEmail, role, googleCalendarId, sortOrder: await nextSortOrder(role) },
  });

  revalidatePath("/admin/team");
}

async function updateTeamMember(formData: FormData) {
  "use server";

  await requireAdminPage();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const secondaryEmail = String(formData.get("secondaryEmail") ?? "").trim().toLowerCase() || null;
  const role = String(formData.get("role") ?? "") as Role;
  const active = formData.get("active") === "on";
  const googleCalendarId = String(formData.get("googleCalendarId") ?? "primary").trim() || "primary";

  if (!id || !name || !email || !isRole(role)) {
    return;
  }

  const existingMember = await prisma.teamMember.findUnique({
    where: { id },
    select: { role: true },
  });
  const nextOrder = existingMember?.role === role ? undefined : await nextSortOrder(role);

  await prisma.teamMember.update({
    where: { id },
    data: { name, email, secondaryEmail, role, active, googleCalendarId, ...(nextOrder === undefined ? {} : { sortOrder: nextOrder }) },
  });

  revalidatePath("/admin/team");
}

async function deleteTeamMember(formData: FormData) {
  "use server";

  await requireAdminPage();

  const id = String(formData.get("id") ?? "");

  if (!id) {
    return;
  }

  await prisma.teamMember.delete({ where: { id } });

  revalidatePath("/admin/team");
}

async function updateEventSettings(formData: FormData) {
  "use server";

  await requireAdminPage();

  const eventTitle = String(formData.get("eventTitle") ?? "").trim();
  const eventDescription = String(formData.get("eventDescription") ?? "").trim();
  const bookingEndDate = parseBookingEndDate(String(formData.get("bookingEndDate") ?? ""));

  await updateBookingSettings(eventTitle, eventDescription, bookingEndDate);
  revalidatePath("/admin/team");
  revalidatePath("/book");
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; team?: string }>;
}) {
  await requireAdminPage();

  const params = await searchParams;
  const settings = await getBookingSettings();
  const members = await prisma.teamMember.findMany({
    orderBy: [{ role: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <main className="min-h-screen bg-[#f4f0e8] px-6 py-10 text-[#1f2a24]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-[2rem] bg-[#12382b] p-8 text-white shadow-xl md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-[#b5d99c]">Admin</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Team calendar setup</h1>
            <p className="mt-3 max-w-2xl text-white/75">
              Add team members, set required roles, and connect Google Calendar for anyone whose availability should be checked automatically.
            </p>
          </div>
          <Link href="/book" className="rounded-full bg-[#f7c948] px-5 py-3 font-bold text-[#12382b] transition hover:bg-[#ffd866]">
            View booking page
          </Link>
          <Link href="/google-connect" className="rounded-full border border-white/30 px-5 py-3 font-bold text-white transition hover:bg-white/10">
            Team Google link
          </Link>
        </header>

        {params.google ? (
          <div className="rounded-2xl border border-[#d8c7a3] bg-white px-5 py-4 text-sm font-medium">
            Google Calendar status: {params.google.replaceAll("_", " ")}
          </div>
        ) : null}

        {params.team ? (
          <div className="rounded-2xl border border-[#d8c7a3] bg-white px-5 py-4 text-sm font-medium">
            Team status: {params.team.replaceAll("_", " ")}
          </div>
        ) : null}

        <section className="rounded-[1.5rem] bg-white p-6 shadow-lg">
          <h2 className="text-2xl font-black">Booking event details</h2>
          <form action={updateEventSettings} className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-bold">
              Event name
              <input name="eventTitle" defaultValue={settings.eventTitle} className="rounded-xl border border-[#d8c7a3] px-4 py-3 font-normal" />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Event description intro
              <textarea
                name="eventDescription"
                defaultValue={settings.eventDescription}
                rows={4}
                className="resize-none rounded-xl border border-[#d8c7a3] px-4 py-3 font-normal"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Booking end date
              <input
                name="bookingEndDate"
                type="date"
                defaultValue={toBookingEndDateInputValue(settings.bookingEndDate)}
                className="rounded-xl border border-[#d8c7a3] px-4 py-3 font-normal"
              />
            </label>
            <p className="text-sm font-medium text-[#5f665f]">
              The full booking details are always added to the invite. Available intro placeholders: {"{customerName}"}, {"{customerFirstName}"}, {"{customerLastName}"}, {"{customerEmail}"}, {"{customerPhone}"}, {"{photoshootLocation}"}, {"{peopleCount}"}, {"{interviewSubject}"}, {"{notes}"}, {"{startTime}"}, {"{endTime}"}.
            </p>
            <button className="w-fit rounded-xl bg-[#12382b] px-5 py-3 font-bold text-white">Save event details</button>
          </form>
        </section>

        <section className="rounded-[1.5rem] bg-white p-6 shadow-lg">
          <h2 className="text-2xl font-black">Add team member</h2>
          <form action={createTeamMember} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_1fr_180px_1fr_auto]">
            <input name="name" required placeholder="Name" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
            <input name="email" required type="email" placeholder="Primary email" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
            <input name="secondaryEmail" type="email" placeholder="Secondary email, optional" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
            <select name="role" defaultValue={Role.WRITER} className="rounded-xl border border-[#d8c7a3] px-4 py-3">
              {Object.values(Role).map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <input name="googleCalendarId" placeholder="Google Calendar ID, optional" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
            <button className="rounded-xl bg-[#12382b] px-5 py-3 font-bold text-white">Add</button>
          </form>
          <p className="mt-3 text-sm font-medium text-[#5f665f]">
            Nongoogle members only need a name and email. They can be assigned bookings and receive email invitations, but their outside calendar availability is not checked.
          </p>
        </section>

        <TeamPriorityList
          key={members.map((member) => `${member.id}:${member.role}:${member.sortOrder}:${member.active}`).join("|")}
          members={members
            .filter((member) => member.role)
            .map((member) => ({
              id: member.id,
              name: member.name,
              email: member.email,
              role: member.role as Role,
              active: member.active,
              sortOrder: member.sortOrder,
              hasGoogleCalendar: Boolean(member.googleRefreshToken),
            }))}
        />

        <section className="grid gap-4">
          {members.map((member) => (
            <form key={member.id} action={updateTeamMember} className="grid gap-3 rounded-[1.5rem] bg-white p-5 shadow-md lg:grid-cols-[1fr_1fr_1fr_170px_1fr_110px_auto] lg:items-center">
              <input type="hidden" name="id" value={member.id} />
              <input name="name" defaultValue={member.name} className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
              <input name="email" type="email" aria-label="Primary email" defaultValue={member.email} className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
              <input name="secondaryEmail" type="email" aria-label="Secondary email" defaultValue={member.secondaryEmail ?? ""} placeholder="Secondary email" className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
              <select name="role" defaultValue={member.role ?? ""} className="rounded-xl border border-[#d8c7a3] px-4 py-3">
                <option value="">Assign role</option>
                {Object.values(Role).map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <input name="googleCalendarId" aria-label="Google Calendar ID" defaultValue={member.googleCalendarId} className="rounded-xl border border-[#d8c7a3] px-4 py-3" />
              <label className="flex items-center gap-2 font-semibold">
                <input name="active" type="checkbox" defaultChecked={member.active} /> Active
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-xl bg-[#1f2a24] px-4 py-3 font-bold text-white">Save</button>
                <Link href={`/api/google/oauth/start?teamMemberId=${member.id}`} className="rounded-xl border border-[#12382b] px-4 py-3 font-bold text-[#12382b]">
                  {member.googleRefreshToken ? "Reconnect" : "Connect Google"}
                </Link>
                <button
                  formAction={deleteTeamMember}
                  className="rounded-xl border border-[#9f2f2f] px-4 py-3 font-bold text-[#9f2f2f]"
                >
                  Remove
                </button>
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
