import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

// Exercise the actual server modules with isolated database and Google adapters.
function loadModule(path, dependencies) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loaded = { exports: {} };
  const resolve = (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name === "server-only") return {};
    if (name === "@prisma/client") return require(name);
    throw new Error(`Unexpected dependency: ${name}`);
  };
  new Function("require", "module", "exports", outputText)(resolve, loaded, loaded.exports);
  return loaded.exports;
}

function setup(blockedDates) {
  const members = [
    { id: "writer", name: "Writer", role: "WRITER", sortOrder: 0 },
    { id: "photographer", name: "Photographer", role: "PHOTOGRAPHER", sortOrder: 0 },
  ];
  let googleCalls = 0;
  const prisma = {
    blackoutDate: {
      findMany: async ({ where }) => blockedDates
        .filter((date) => date >= where.date.gte && date <= where.date.lte)
        .map((date) => ({ date })),
    },
    teamMember: { findMany: async () => members, findFirst: async () => members[0] },
  };
  const settings = loadModule("lib/bookingSettings.ts", { "@/lib/prisma": { prisma } });
  const blackout = loadModule("lib/blackoutDates.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/bookingSettings": settings,
  });
  const scheduling = loadModule("lib/scheduling.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/bookingSettings": settings,
    "@/lib/blackoutDates": blackout,
    "@/lib/googleCalendar": {
      getFreeBusy: async () => { googleCalls++; return []; },
    },
  });
  return { prisma, settings, blackout, scheduling, googleCalls: () => googleCalls };
}

test("only valid full calendar dates are accepted", () => {
  const { settings } = setup([]);
  assert.ok(settings.parseBookingEndDate("2028-02-29"));
  for (const value of ["", "2027-02-29", "2026-02-30", "2026-13-01", "10/27/2026"]) {
    assert.equal(settings.parseBookingEndDate(value), null);
  }
});

test("blackouts remove all slots despite free Google calendars; adjacent dates remain available", async () => {
  const { scheduling, googleCalls } = setup(["2026-11-03"]);
  const slots = await scheduling.getAvailableSlots(new Date(2026, 10, 2), new Date(2026, 10, 5));
  assert.ok(slots.length > 0);
  const days = new Set(slots.map(({ start }) => new Date(start).getDate()));
  assert.deepEqual([...days], [2, 4]);
  assert.equal(googleCalls(), 1);
});

test("a fully blocked range returns no availability before consulting Google", async () => {
  const { scheduling, googleCalls } = setup(["2026-11-03"]);
  assert.deepEqual(await scheduling.getAvailableSlots(new Date(2026, 10, 3), new Date(2026, 10, 4)), []);
  assert.equal(googleCalls(), 0);
});

test("stale booking selections cannot assign team members on a blackout date", async () => {
  const { scheduling, googleCalls } = setup(["2026-11-03"]);
  assert.equal(await scheduling.selectMembersForSlot(new Date(2026, 10, 3, 9), new Date(2026, 10, 3, 9, 45)), null);
  assert.equal(googleCalls(), 0);
  assert.ok(await scheduling.selectMembersForSlot(new Date(2026, 10, 4, 9), new Date(2026, 10, 4, 9, 45)));
});

test("date boundaries use local dates and an exclusive end, including overnight bookings", async () => {
  const { blackout } = setup(["2026-11-03"]);
  assert.equal((await blackout.getBlackoutDatesForRange(new Date(2026, 10, 2, 23, 15), new Date(2026, 10, 3))).size, 0);
  assert.equal((await blackout.getBlackoutDatesForRange(new Date(2026, 10, 2, 23, 30), new Date(2026, 10, 3, 0, 15))).size, 1);
  assert.equal((await blackout.getBlackoutDatesForRange(new Date(2026, 10, 3, 23), new Date(2026, 10, 4))).size, 1);
  assert.equal((await blackout.getBlackoutDatesForRange(new Date(2026, 10, 4), new Date(2026, 10, 5))).size, 0);
});

test("removing a blackout restores availability", async () => {
  const dates = ["2026-11-03"];
  const { scheduling } = setup(dates);
  assert.deepEqual(await scheduling.getAvailableSlots(new Date(2026, 10, 3), new Date(2026, 10, 4)), []);
  dates.pop();
  assert.ok((await scheduling.getAvailableSlots(new Date(2026, 10, 3), new Date(2026, 10, 4))).length > 0);
});

test("booking rechecks a newly added blackout inside its transaction before creating records or calendar events", async () => {
  const { prisma, blackout } = setup([]);
  let transactionChecks = 0;
  prisma.$transaction = async (callback) => callback({
    blackoutDate: { findMany: async () => { transactionChecks++; return [{ date: "2026-11-03" }]; } },
    booking: { findFirst: () => assert.fail("must reject before checking bookings"), create: () => assert.fail("must not create booking") },
  });
  const { POST } = loadModule("app/api/book/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/prisma": { prisma },
    "@/lib/blackoutDates": blackout,
    "@/lib/bookingRules": { getMinimumBookingStartTime: () => new Date(2026, 9, 27), MIN_BOOKING_LEAD_HOURS: 72 },
    "@/lib/bookingSettings": {
      getBookingSettings: async () => ({ eventTitle: "Booking", eventDescription: "Details" }),
      renderBookingTemplate: (value) => value,
      renderBookingDetails: () => "Details",
    },
    "@/lib/googleCalendar": {
      createCalendarEvent: () => assert.fail("must not create Google event"),
      isGoogleApiTimeoutError: () => false,
    },
    "@/lib/hubspot": {},
    "@/lib/scheduling": {
      SLOT_MINUTES: 45,
      selectMembersForSlot: async () => ({ writer: { id: "writer" }, photographer: { id: "photographer" } }),
      getActiveNotificationOrganizer: async () => ({ id: "organizer" }),
      serializableTransactionOptions: {},
    },
  });
  const response = await POST(new Request("http://localhost/api/book", {
    method: "POST",
    body: JSON.stringify({
      customerFirstName: "Test", customerLastName: "Customer", customerEmail: "test@example.com",
      customerPhone: "555-1234", photoshootLocation: "Office", peopleCount: 1,
      interviewSubject: "Interview", startTime: new Date(2026, 10, 3, 9).toISOString(),
    }),
  }));
  assert.equal(response.status, 409);
  assert.equal(transactionChecks, 1);
});
