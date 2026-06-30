import { google } from "googleapis";
import type { TeamMember } from "@prisma/client";
import { getGoogleRedirectUri, requiredEnv } from "@/lib/env";

export type BusyBlock = {
  start: Date;
  end: Date;
};

export type MemberBusyBlocks = {
  memberId: string;
  busy: BusyBlock[];
};

export type CalendarEventInput = {
  assignedMembers: Pick<TeamMember, "name" | "email" | "secondaryEmail" | "googleRefreshToken" | "googleCalendarId">[];
  organizer?: Pick<TeamMember, "googleRefreshToken" | "googleCalendarId"> | null;
  customer: {
    name: string;
    email: string;
  };
  title?: string;
  description?: string;
  rescheduleUrl?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
};

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];
const DEFAULT_GOOGLE_API_TIMEOUT_MS = 10_000;
const BOOKING_EMAIL_REMINDER_MINUTES = 9 * 60;
const BOOKING_FINAL_REMINDER_MINUTES = 30;

function getGoogleApiTimeoutMs() {
  const configured = Number(process.env.GOOGLE_API_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_GOOGLE_API_TIMEOUT_MS;
}

export function isGoogleApiTimeoutError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "ETIMEDOUT" || code === "ECONNABORTED" || /timeout|timed out/i.test(error.message);
}

export function getOAuthClient(refreshToken?: string | null) {
  const client = new google.auth.OAuth2(
    requiredEnv("GOOGLE_CLIENT_ID"),
    requiredEnv("GOOGLE_CLIENT_SECRET"),
    getGoogleRedirectUri(),
  );

  if (refreshToken) {
    client.setCredentials({ refresh_token: refreshToken });
  }

  return client;
}

export function getGoogleAuthUrl(state: string) {
  const client = getOAuthClient();

  // access_type=offline and prompt=consent are required to reliably receive a refresh token.
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  });
}

export async function exchangeGoogleAuthCode(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const userInfo = await oauth2.userinfo.get();

  return {
    email: userInfo.data.email?.toLowerCase() ?? null,
    name: userInfo.data.name ?? userInfo.data.email ?? "Connected Google user",
    refreshToken: tokens.refresh_token ?? null,
  };
}

export async function getFreeBusy(
  teamMembers: Pick<TeamMember, "id" | "googleRefreshToken" | "googleCalendarId">[],
  timeMin: Date,
  timeMax: Date,
): Promise<MemberBusyBlocks[]> {
  return Promise.all(
    teamMembers.map(async (member) => {
      if (!member.googleRefreshToken) {
        return {
          memberId: member.id,
          busy: [],
        };
      }

      const auth = getOAuthClient(member.googleRefreshToken);
      const calendar = google.calendar({ version: "v3", auth });

      // FreeBusy returns opaque busy ranges only. We never expose these internals to public callers.
      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          items: [{ id: member.googleCalendarId || "primary" }],
        },
      }, {
        timeout: getGoogleApiTimeoutMs(),
      });

      const calendarId = member.googleCalendarId || "primary";
      const busy = response.data.calendars?.[calendarId]?.busy ?? [];

      return {
        memberId: member.id,
        busy: busy
          .filter((block) => block.start && block.end)
          .map((block) => ({
            start: new Date(block.start as string),
            end: new Date(block.end as string),
          })),
      };
    }),
  );
}

export async function createCalendarEvent({
  assignedMembers,
  organizer: fallbackOrganizer,
  customer,
  title,
  description,
  rescheduleUrl,
  location,
  startTime,
  endTime,
}: CalendarEventInput) {
  const organizer = assignedMembers.find((member) => member.googleRefreshToken) ?? fallbackOrganizer;

  if (!organizer?.googleRefreshToken) {
    throw new Error("No connected Google Calendar is available to send booking notifications.");
  }

  const auth = getOAuthClient(organizer.googleRefreshToken);
  const calendar = google.calendar({ version: "v3", auth });
  const attendeeEmails = new Set<string>();
  const addAttendee = (displayName: string, email?: string | null) => {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || attendeeEmails.has(normalizedEmail)) {
      return null;
    }

    attendeeEmails.add(normalizedEmail);
    return {
      displayName,
      email: normalizedEmail,
    };
  };

  const attendees = [
    ...assignedMembers.flatMap((member) => [
      addAttendee(member.name, member.email),
      addAttendee(`${member.name} secondary`, member.secondaryEmail),
    ]),
    addAttendee(customer.name, customer.email),
  ].filter((attendee): attendee is { displayName: string; email: string } => Boolean(attendee));

  const response = await calendar.events.insert({
    calendarId: organizer.googleCalendarId || "primary",
    sendUpdates: "all",
    requestBody: {
      summary: title || `Booking with ${customer.name}`,
      description: description || "Created by Evergreen Scheduler.",
      source: rescheduleUrl ? { title: "Reschedule booking", url: rescheduleUrl } : undefined,
      location,
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      attendees,
      reminders: {
        useDefault: false,
        overrides: [
          {
            method: "email",
            minutes: BOOKING_EMAIL_REMINDER_MINUTES,
          },
          {
            method: "popup",
            minutes: BOOKING_FINAL_REMINDER_MINUTES,
          },
          {
            method: "email",
            minutes: BOOKING_FINAL_REMINDER_MINUTES,
          },
        ],
      },
    },
  }, {
    timeout: getGoogleApiTimeoutMs(),
  });

  return response.data.id ?? null;
}

export async function deleteCalendarEvent(
  eventId: string,
  calendarOwners: (Pick<TeamMember, "googleRefreshToken" | "googleCalendarId"> | null | undefined)[],
) {
  const seenCalendars = new Set<string>();
  const candidates = calendarOwners.filter((owner): owner is Pick<TeamMember, "googleRefreshToken" | "googleCalendarId"> =>
    Boolean(owner?.googleRefreshToken),
  );
  let lastError: unknown = null;
  let triedCalendar = false;

  if (candidates.length === 0) {
    throw new Error("No connected Google Calendar is available to cancel the booking event.");
  }

  for (const owner of candidates) {
    const calendarId = owner.googleCalendarId || "primary";
    const key = `${owner.googleRefreshToken}:${calendarId}`;

    if (seenCalendars.has(key)) {
      continue;
    }

    seenCalendars.add(key);
    triedCalendar = true;

    try {
      const auth = getOAuthClient(owner.googleRefreshToken);
      const calendar = google.calendar({ version: "v3", auth });

      await calendar.events.delete({
        calendarId,
        eventId,
        sendUpdates: "all",
      }, {
        timeout: getGoogleApiTimeoutMs(),
      });

      return true;
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : null;
      const code = typeof error === "object" && error && "code" in error ? Number(error.code) : null;

      if (status === 404 || code === 404 || status === 410 || code === 410) {
        continue;
      }

      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return triedCalendar;
}
