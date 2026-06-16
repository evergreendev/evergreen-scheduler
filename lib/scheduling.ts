import { Prisma, Role, type TeamMember } from "@prisma/client";
import { getFreeBusy, type MemberBusyBlocks } from "@/lib/googleCalendar";
import { prisma } from "@/lib/prisma";

export const SLOT_MINUTES = 45;
export const REQUIRED_ROLES = [Role.WRITER, Role.PHOTOGRAPHER] as const;

type SchedulableMember = Pick<
  TeamMember,
  "id" | "name" | "email" | "secondaryEmail" | "role" | "sortOrder" | "googleRefreshToken" | "googleCalendarId" | "lastBookedAt"
>;

export type PublicSlot = {
  start: string;
  end: string;
};

export type AssignedMembers = {
  writer: SchedulableMember;
  photographer: SchedulableMember;
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && startB < endA;
}

function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function getBusinessDayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(9, 0, 0, 0);

  const end = new Date(date);
  end.setHours(17, 0, 0, 0);

  return { start, end };
}

export function generateCandidateSlots(rangeStart: Date, rangeEnd: Date) {
  const slots: { start: Date; end: Date }[] = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);

  while (cursor < rangeEnd) {
    if (isBusinessDay(cursor)) {
      const bounds = getBusinessDayBounds(cursor);
      let slotStart = new Date(Math.max(bounds.start.getTime(), rangeStart.getTime()));

      const remainder = slotStart.getMinutes() % SLOT_MINUTES;
      if (remainder !== 0 || slotStart.getSeconds() || slotStart.getMilliseconds()) {
        slotStart.setMinutes(slotStart.getMinutes() + (SLOT_MINUTES - remainder), 0, 0);
      }

      while (slotStart < bounds.end && slotStart < rangeEnd) {
        const slotEnd = addMinutes(slotStart, SLOT_MINUTES);
        if (slotEnd <= bounds.end && slotEnd <= rangeEnd) {
          slots.push({ start: new Date(slotStart), end: slotEnd });
        }
        slotStart = slotEnd;
      }
    }

    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  return slots;
}

export function getAvailableMembersForSlot(
  members: SchedulableMember[],
  busyBlocks: MemberBusyBlocks[],
  startTime: Date,
  endTime: Date,
) {
  const busyByMemberId = new Map(busyBlocks.map((entry) => [entry.memberId, entry.busy]));

  return members.filter((member) => {
    const busy = busyByMemberId.get(member.id) ?? [];
    return !busy.some((block) => overlaps(startTime, endTime, block.start, block.end));
  });
}

function pickHighestPriority(members: SchedulableMember[]) {
  return [...members].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  })[0];
}

export async function getActiveRequiredMembers() {
  return prisma.teamMember.findMany({
    where: {
      active: true,
      role: { in: [...REQUIRED_ROLES] },
    },
    orderBy: [{ role: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getActiveNotificationOrganizer() {
  return prisma.teamMember.findFirst({
    where: {
      active: true,
      googleRefreshToken: { not: null },
    },
    orderBy: [{ role: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getAvailableSlots(rangeStart: Date, rangeEnd: Date): Promise<PublicSlot[]> {
  const [members, organizer] = await Promise.all([getActiveRequiredMembers(), getActiveNotificationOrganizer()]);
  const candidates = generateCandidateSlots(rangeStart, rangeEnd);

  if (!members.some((member) => member.role === Role.WRITER) || !members.some((member) => member.role === Role.PHOTOGRAPHER)) {
    return [];
  }

  if (!organizer) {
    return [];
  }

  if (candidates.length === 0) {
    return [];
  }

  const busyBlocks = await getFreeBusy(members, rangeStart, rangeEnd);

  return candidates
    .filter((slot) => {
      const available = getAvailableMembersForSlot(members, busyBlocks, slot.start, slot.end);
      return available.some((member) => member.role === Role.WRITER) && available.some((member) => member.role === Role.PHOTOGRAPHER);
    })
    .map((slot) => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
    }));
}

export async function selectMembersForSlot(startTime: Date, endTime: Date): Promise<AssignedMembers | null> {
  const members = await getActiveRequiredMembers();

  if (!members.length) return null;

  const busyBlocks = await getFreeBusy(members, startTime, endTime);
  const available = getAvailableMembersForSlot(members, busyBlocks, startTime, endTime);
  const writer = pickHighestPriority(available.filter((member) => member.role === Role.WRITER));
  const photographer = pickHighestPriority(available.filter((member) => member.role === Role.PHOTOGRAPHER));

  if (!writer || !photographer) {
    return null;
  }

  return { writer, photographer };
}

export async function hasLocalBookingConflict(writerId: string, photographerId: string, startTime: Date, endTime: Date) {
  const conflict = await prisma.booking.findFirst({
    where: {
      OR: [{ writerId }, { photographerId }],
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true },
  });

  return Boolean(conflict);
}

export const serializableTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};
