import Link from "next/link";
import { BookingClient, type BookingFormInitialValues } from "./BookingClient";
import { getBookingSettings } from "@/lib/bookingSettings";

export const dynamic = "force-dynamic";

type BookPageSearchParams = Record<string, string | string[] | undefined>;

function firstParam(searchParams: BookPageSearchParams, keys: string[]) {
  for (const key of keys) {
    const value = searchParams[key];
    const firstValue = Array.isArray(value) ? value[0] : value;

    if (firstValue) {
      return firstValue;
    }
  }

  return "";
}

function getInitialBookingValues(searchParams: BookPageSearchParams): BookingFormInitialValues {
  const customerName = firstParam(searchParams, ["customerName", "name", "fullName", "full_name"]).trim();
  const firstName = firstParam(searchParams, ["customerFirstName", "firstName", "first_name"]).trim();
  const lastName = firstParam(searchParams, ["customerLastName", "lastName", "last_name"]).trim();
  const [nameFirst = "", ...nameRest] = customerName.split(/\s+/).filter(Boolean);

  return {
    customerFirstName: firstName || nameFirst,
    customerLastName: lastName || nameRest.join(" "),
    customerEmail: firstParam(searchParams, ["customerEmail", "email", "emailAddress", "email_address"]).trim(),
    customerPhone: firstParam(searchParams, ["customerPhone", "phone", "phoneNumber", "phone_number"]).trim(),
    photoshootLocation: firstParam(searchParams, ["photoshootLocation", "location", "photoshoot_location"]).trim(),
    peopleCount: firstParam(searchParams, ["peopleCount", "people", "people_count"]).trim(),
    interviewSubject: firstParam(searchParams, ["interviewSubject", "subject", "interview_subject"]).trim(),
    notes: firstParam(searchParams, ["notes", "note"]).trim(),
    hubspotCompanyId: firstParam(searchParams, ["hubspotCompanyId", "hubspot_company_id", "companyId", "company_id"]).trim(),
  };
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<BookPageSearchParams>;
}) {
  const settings = await getBookingSettings();
  const initialValues = getInitialBookingValues(await searchParams);

  return (
    <main className="min-h-screen bg-[#f4f0e8] px-6 py-10 text-[#1f2a24]">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-[#4d7c59]">Evergreen Scheduler</p>
            <h1 className="mt-3 max-w-3xl text-5xl font-black tracking-tight md:text-7xl">{settings.eventTitle}</h1>
          </div>
        </header>
        <BookingClient initialValues={initialValues} />
      </div>
    </main>
  );
}
