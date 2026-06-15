export const MIN_BOOKING_LEAD_HOURS = 8;

export function getMinimumBookingStartTime(now = new Date()) {
  return new Date(now.getTime() + MIN_BOOKING_LEAD_HOURS * 60 * 60_000);
}
