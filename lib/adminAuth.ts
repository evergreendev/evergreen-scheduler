import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

const ADMIN_COOKIE_NAME = "evergreen_admin_session";
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 12;
const ADMIN_COOKIE_PAYLOAD = "admin";

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || null;
}

function signAdminCookie() {
  const password = getAdminPassword();
  if (!password) return null;

  return createHmac("sha256", password).update(ADMIN_COOKIE_PAYLOAD).digest("hex");
}

function matches(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

export function isAdminPasswordConfigured() {
  return Boolean(getAdminPassword());
}

export function isValidAdminPassword(password: string) {
  const configuredPassword = getAdminPassword();
  return Boolean(configuredPassword && matches(password, configuredPassword));
}

export async function isAdminAuthenticated() {
  const expected = signAdminCookie();
  if (!expected) return false;

  const session = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  return Boolean(session && matches(session, expected));
}

export async function createAdminSession() {
  const signature = signAdminCookie();
  if (!signature) return false;

  (await cookies()).set(ADMIN_COOKIE_NAME, signature, {
    httpOnly: true,
    maxAge: ADMIN_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return true;
}

export async function requireAdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }
}

export async function requireAdminApi() {
  if (await isAdminAuthenticated()) {
    return null;
  }

  return NextResponse.json({ error: "Admin authentication is required." }, { status: 401 });
}
