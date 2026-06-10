import { NextResponse } from "next/server";
import { exchangeCodeForRefreshToken } from "@/lib/googleCalendar";
import { getBaseUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const teamMemberId = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${getBaseUrl()}/admin/team?google=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code || !teamMemberId) {
    return NextResponse.json({ error: "OAuth callback requires code and state." }, { status: 400 });
  }

  try {
    const refreshToken = await exchangeCodeForRefreshToken(code);

    if (!refreshToken) {
      return NextResponse.redirect(`${getBaseUrl()}/admin/team?google=no_refresh_token`);
    }

    await prisma.teamMember.update({
      where: { id: teamMemberId },
      data: { googleRefreshToken: refreshToken },
    });

    return NextResponse.redirect(`${getBaseUrl()}/admin/team?google=connected`);
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(`${getBaseUrl()}/admin/team?google=error`);
  }
}
