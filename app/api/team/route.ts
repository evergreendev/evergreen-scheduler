import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireAdminApi } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

const roles = new Set(Object.values(Role));

async function nextSortOrder(role: Role) {
  const lastMember = await prisma.teamMember.findFirst({
    where: { role },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return (lastMember?.sortOrder ?? -1) + 1;
}

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const members = await prisma.teamMember.findMany({
    orderBy: [{ role: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ members });
}

export async function POST(request: Request) {
  try {
    const unauthorized = await requireAdminApi();
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const role = String(body.role ?? "");

    if (!body.name || !body.email || !roles.has(role as Role)) {
      return NextResponse.json({ error: "Name, email, and a valid role are required." }, { status: 400 });
    }

    const member = await prisma.teamMember.create({
      data: {
        name: String(body.name),
        email: String(body.email).toLowerCase(),
        secondaryEmail: body.secondaryEmail ? String(body.secondaryEmail).toLowerCase() : null,
        role: role as Role,
        active: body.active ?? true,
        sortOrder: await nextSortOrder(role as Role),
        googleCalendarId: body.googleCalendarId || "primary",
      },
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create team member." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const unauthorized = await requireAdminApi();
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const role = String(body.role ?? "");
    const orderedIds: string[] = Array.isArray(body.orderedIds) ? body.orderedIds.map(String) : [];

    if (!roles.has(role as Role) || orderedIds.length === 0) {
      return NextResponse.json({ error: "A valid role and orderedIds are required." }, { status: 400 });
    }

    const members = await prisma.teamMember.findMany({
      where: { id: { in: orderedIds }, role: role as Role },
      select: { id: true },
    });

    if (members.length !== orderedIds.length) {
      return NextResponse.json({ error: "All orderedIds must belong to the selected role." }, { status: 400 });
    }

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.teamMember.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update team member priority." }, { status: 500 });
  }
}
