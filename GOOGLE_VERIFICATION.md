# Google OAuth Verification Guide

This app connects team members' Google Calendars so Evergreen Scheduler can calculate bookable slots and send booking calendar invitations. The current OAuth scopes are defined in `lib/googleCalendar.ts`.

## Current scopes

| Scope | Purpose | Data accessed or changed |
| --- | --- | --- |
| `https://www.googleapis.com/auth/calendar.freebusy` | Checks connected team members' availability before showing public booking slots and again before confirming a booking. | Reads only busy time ranges for the configured calendar. It does not read event titles, descriptions, locations, attendees, or event details. |
| `https://www.googleapis.com/auth/calendar.events` | Creates the confirmed booking event on a connected organizer/team calendar. | Creates an event with the booking title, description, location, start/end time, attendees, and reminders. The app stores the returned Google event ID. |
| `https://www.googleapis.com/auth/userinfo.email` | Identifies the Google account that completed OAuth and links it to the correct team member record. | Reads the connected Google account's primary email address. |
| `https://www.googleapis.com/auth/userinfo.profile` | Displays/stores a readable name for signup-based calendar connection. | Reads the connected Google account's display name. |

## Sensitive scope justification text

Use this text in Google Cloud Console's OAuth Verification Center. Edit product names, domain names, or support references as needed before submitting.

### `https://www.googleapis.com/auth/calendar.freebusy`

Evergreen Scheduler uses this scope to check whether connected team members are available for a requested booking time. The app calls Google Calendar FreeBusy for each connected team member's configured calendar and only uses the returned busy start/end ranges to remove unavailable time slots from the public booking UI. The app does not display or store Google Calendar event titles, descriptions, locations, attendees, or other event details.

A narrower scope is not sufficient because the app must verify real-time calendar availability before displaying slots and again immediately before confirming a booking. The `calendar.freebusy` scope is the narrowest Calendar scope available for this behavior.

### `https://www.googleapis.com/auth/calendar.events`

Evergreen Scheduler uses this scope to create a booking event on a connected organizer or assigned team member's Google Calendar after a customer submits a booking. The event contains the scheduled time, booking title, booking details, location, customer attendee, assigned team member attendees, and reminders. The app stores only the returned Google Calendar event ID on the booking record so the admin interface can show that the calendar event was sent.

A narrower read-only or free/busy scope is not sufficient because the app must write a new event and send attendee updates. The app does not request the broader full-calendar scope because it does not need to manage calendar settings, share calendars, delete calendars, or access capabilities outside event creation.

## OAuth demo video checklist

Google asks for an unlisted video that demonstrates the OAuth grant and every sensitive scope in use.

Record this flow in English:

1. Open the deployed app on the same domain listed in the OAuth consent screen.
2. Sign in as an admin if needed.
3. Go to `/admin/team`.
4. Click `Connect Google` or `Reconnect` for a team member.
5. Show the Google OAuth consent screen, including the app name, requested scopes, and browser address bar with the OAuth client ID.
6. Grant access.
7. Show the successful redirect back to `/admin/team?google=connected`.
8. Open the public booking page and show that available slots are loaded from connected calendars.
9. Complete a test booking.
10. Open the connected Google Calendar and show the created event with attendees, time, location, description, and reminders.

Do not include secrets, `.env` values, database credentials, or production customer data in the video.

## Google Cloud verification checklist

1. Use a production Google Cloud project for the public app. Keep local/development OAuth clients in a separate testing project when possible.
2. Enable the Google Calendar API in the production project.
3. Configure the OAuth consent screen:
   - App name: `Evergreen Scheduler` or the production customer-facing name.
   - User support email: monitored support address.
   - App logo: production logo, if available.
   - Application home page: public URL on the authorized domain.
   - Privacy policy URL: public URL on the same authorized domain.
   - Terms of service URL: public URL if available.
   - Developer contact information: monitored engineering/admin email.
4. Verify ownership of the authorized domain in Google Search Console using an owner/editor account on the Google Cloud project.
5. Add authorized domains for the production host only, for example `example.com`.
6. Create a Web application OAuth client.
7. Add the production authorized redirect URI:
   - `https://YOUR_DOMAIN/api/auth/callback/google`
8. Add the current app scopes on the Data Access page:
   - `https://www.googleapis.com/auth/calendar.freebusy`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
9. Confirm the production environment variables match the production OAuth client:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN`
   - `GOOGLE_REDIRECT_URI=https://YOUR_DOMAIN/api/auth/callback/google` if overriding the default
10. Publish a privacy policy that clearly explains:
    - The app accesses Google Calendar availability and creates booking events only after a team member connects Google.
    - The app stores Google OAuth refresh tokens, team member calendar IDs, team member profile/email values, booking details, and Google event IDs.
    - Google Calendar event detail data is not read for availability checks; only busy ranges are used.
    - Data is used only for scheduling, availability calculation, calendar invitations, reminders, support, security, and service operation.
    - Data is not sold and is not used for advertising.
    - Users can request calendar disconnection and data deletion.
11. Make sure the home page publicly describes the app and links to the privacy policy.
12. Submit in Google Cloud Console's OAuth Verification Center.
13. Provide the scope justifications above and the unlisted YouTube demo video link.
14. Monitor the support email and developer contact email for Google Trust & Safety follow-up.

## Official references

- Google OAuth app verification help: https://support.google.com/cloud/answer/13463073
- Sensitive scope verification: https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- OAuth 2.0 scopes for Google APIs: https://developers.google.com/identity/protocols/oauth2/scopes
- Calendar API scopes: https://developers.google.com/workspace/calendar/api/auth
- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy
