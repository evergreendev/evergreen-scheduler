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
  assignedMembers: Pick<TeamMember, "name" | "email" | "googleRefreshToken" | "googleCalendarId">[];
  customer: {
    name: string;
    email: string;
  };
  title?: string;
  description?: string;
  startTime: Date;
  endTime: Date;
};

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];
const DEFAULT_GOOGLE_API_TIMEOUT_MS = 10_000;

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
          busy: [{ start: timeMin, end: timeMax }],
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
  customer,
  title,
  description,
  startTime,
  endTime,
}: CalendarEventInput) {
  const organizer = assignedMembers.find((member) => member.googleRefreshToken);

  if (!organizer?.googleRefreshToken) {
    throw new Error("No assigned team member has a connected Google Calendar.");
  }

  const auth = getOAuthClient(organizer.googleRefreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  const attendees = [
    ...assignedMembers.map((member) => ({
      displayName: member.name,
      email: member.email,
    })),
    {
      displayName: customer.name,
      email: customer.email,
    },
  ];

  const response = await calendar.events.insert({
    calendarId: organizer.googleCalendarId || "primary",
    sendUpdates: "all",
    requestBody: {
      summary: title || `Booking with ${customer.name}`,
      description: description || "Created by Evergreen Scheduler.",
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      attendees,
    },
  }, {
    timeout: getGoogleApiTimeoutMs(),
  });

  return response.data.id ?? null;
}
