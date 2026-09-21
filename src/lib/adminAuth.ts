// Minimal admin auth: one shared password (ADMIN_PASSWORD), a signed cookie
// so we're not storing the password itself client-side, no user accounts —
// intentionally simple for a single-operator MVP admin panel.

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "diggr_admin_session";
const MAX_AGE_SEC = 60 * 60 * 12; // 12 hours

// SECURITY: no fallback secret here on purpose. A hardcoded default would be
// visible to anyone who reads this (shipped, possibly version-controlled)
// source, which would let them forge a valid admin session cookie without
// ever knowing ADMIN_PASSWORD. If SESSION_SECRET isn't set, admin auth must
// fail closed — nobody can log in — rather than fail open onto a guessable
// key. Deployment docs make setting a real SESSION_SECRET a required step.
function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length > 0 ? s : null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function createAdminToken(): string {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET is not set — refusing to create an admin session.");
  const expires = Date.now() + MAX_AGE_SEC * 1000;
  const payload = `admin:${expires}`;
  return `${payload}.${sign(payload, key)}`;
}

export function verifyAdminToken(token: string | undefined): boolean {
  const key = secret();
  if (!key || !token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload, key);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return false;
  const [, expiresStr] = payload.split(":");
  return Number(expiresStr) > Date.now();
}

export function checkPassword(candidate: string): boolean {
  const real = process.env.ADMIN_PASSWORD || "";
  if (!real) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(real);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function isAdminAuthed(): Promise<boolean> {
  const jar = await cookies();
  return verifyAdminToken(jar.get(COOKIE_NAME)?.value);
}

export async function setAdminCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, createAdminToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/** True only when both required secrets are configured. Used to give a
 * clear "server misconfigured" message instead of a raw exception if an
 * operator deploys with ADMIN_PASSWORD set but SESSION_SECRET forgotten. */
export function adminAuthConfigured(): boolean {
  return !!process.env.ADMIN_PASSWORD && !!secret();
}

export { COOKIE_NAME };
