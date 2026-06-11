import { NextResponse } from "next/server";
import { exchangeGoogleAuthCode } from "@/lib/googleCalendar";
import { getBaseUrl } from "@/lib/env";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const isSignup = state === "signup";
  const teamMemberId = isSignup ? null : state;
  const successPath = isSignup ? "/google-connect?google=connected" : "/admin/team?google=connected";
  const noRefreshPath = isSignup ? "/google-connect?google=no_refresh_token" : "/admin/team?google=no_refresh_token";
  const errorPath = isSignup ? "/google-connect?google=error" : "/admin/team?google=error";

  if (!isSignup && !(await isAdminAuthenticated())) {
    return NextResponse.redirect(`${getBaseUrl()}/admin/login`);
  }

  if (error) {
    return NextResponse.redirect(`${getBaseUrl()}${errorPath}&reason=${encodeURIComponent(error)}`);
  }

  if (!code || (!isSignup && !teamMemberId)) {
    return NextResponse.json({ error: "OAuth callback requires code and state." }, { status: 400 });
  }

  try {
    const { email, name, refreshToken } = await exchangeGoogleAuthCode(code);

    if (!refreshToken) {
      return NextResponse.redirect(`${getBaseUrl()}${noRefreshPath}`);
    }

    if (isSignup) {
      if (!email) {
        return NextResponse.redirect(`${getBaseUrl()}/google-connect?google=no_google_email`);
      }

      await prisma.teamMember.upsert({
        where: { email },
        create: {
          name,
          email,
          active: false,
          googleRefreshToken: refreshToken,
        },
        update: {
          name,
          googleRefreshToken: refreshToken,
        },
      });
    } else {
      if (!teamMemberId) {
        return NextResponse.json({ error: "OAuth callback requires state." }, { status: 400 });
      }

      await prisma.teamMember.update({
        where: { id: teamMemberId },
        data: { googleRefreshToken: refreshToken },
      });
    }

    return NextResponse.redirect(`${getBaseUrl()}${successPath}`);
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(`${getBaseUrl()}${errorPath}`);
  }
}
