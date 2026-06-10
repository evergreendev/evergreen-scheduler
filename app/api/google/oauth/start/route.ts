import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/googleCalendar";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const teamMemberId = url.searchParams.get("teamMemberId");

  if (!teamMemberId) {
    return NextResponse.json({ error: "teamMemberId is required." }, { status: 400 });
  }

  const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });

  if (!member) {
    return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  }

  return NextResponse.redirect(getGoogleAuthUrl(teamMemberId));
}
