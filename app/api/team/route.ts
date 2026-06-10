import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const roles = new Set(Object.values(Role));

export async function GET() {
  const members = await prisma.teamMember.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ members });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const role = String(body.role ?? "");

    if (!body.name || !body.email || !roles.has(role as Role)) {
      return NextResponse.json({ error: "Name, email, and a valid role are required." }, { status: 400 });
    }

    const member = await prisma.teamMember.create({
      data: {
        name: String(body.name),
        email: String(body.email).toLowerCase(),
        role: role as Role,
        active: body.active ?? true,
        googleCalendarId: body.googleCalendarId || "primary",
      },
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create team member." }, { status: 500 });
  }
}
