import { google } from "googleapis";
import type { TeamMember } from "@prisma/client";
import { requiredEnv } from "@/lib/env";

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
  startTime: Date;
  endTime: Date;
};

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export function getOAuthClient(refreshToken?: string | null) {
  const client = new google.auth.OAuth2(
    requiredEnv("GOOGLE_CLIENT_ID"),
    requiredEnv("GOOGLE_CLIENT_SECRET"),
    requiredEnv("GOOGLE_REDIRECT_URI"),
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

export async function exchangeCodeForRefreshToken(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens.refresh_token ?? null;
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
      summary: `Booking with ${customer.name}`,
      description: "Created by Evergreen Scheduler.",
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      attendees,
    },
  });

  return response.data.id ?? null;
}
