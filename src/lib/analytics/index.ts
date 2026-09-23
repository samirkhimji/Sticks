// First-party, privacy-conscious analytics. No third-party trackers, no
// cross-site cookies, no fingerprinting. A single anonymous, random cookie
// identifies a browser session-to-session purely so we can count "returning
// visitor" — it carries no personal data and isn't shared with anyone.
//
// Everything here is designed around answering the questions in the spec:
// zero-result searches (what people want that we don't have yet), what gets
// searched, what gets clicked/played, and organic-search share.

import { cookies, headers } from "next/headers";
import { randomUUID, createHash } from "crypto";
import { eq, sql, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeText } from "@/lib/normalize/text";

const VISITOR_COOKIE = "sticks_vid";

export async function getOrCreateVisitorId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing) return existing;
  const id = randomUUID();
  try {
    jar.set(VISITOR_COOKIE, id, {
      maxAge: 60 * 60 * 24 * 400,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  } catch {
    // cookies() is read-only in some contexts (e.g. certain Server Component
    // render paths) — analytics is best-effort and must never break the page.
  }
  return id;
}

export async function recordVisitor(visitorId: string) {
  const [existing] = await db.select().from(schema.visitors).where(eq(schema.visitors.id, visitorId)).limit(1);
  if (existing) {
    await db
      .update(schema.visitors)
      .set({ lastSeen: new Date(), visitCount: sql`${schema.visitors.visitCount} + 1` })
      .where(eq(schema.visitors.id, visitorId));
  } else {
    await db.insert(schema.visitors).values({ id: visitorId }).onConflictDoNothing();
  }
}

export async function logSearch(params: {
  query: string;
  resultType: "TRACK" | "ARTIST" | "DJ" | "ZERO_RESULTS" | "MIXED";
  resultCount: number;
  visitorId?: string;
}) {
  await db.insert(schema.searchEvents).values({
    query: params.query,
    normalizedQuery: normalizeText(params.query),
    resultType: params.resultType,
    resultCount: params.resultCount,
    visitorId: params.visitorId,
  });
}

export async function logClick(params: {
  type: "SET_RESULT" | "TIMESTAMP_PLAY" | "TRACK_LINK" | "ARTIST_LINK" | "RANDOM_SET";
  targetId: string;
  visitorId?: string;
}) {
  await db.insert(schema.clickEvents).values(params);
}

export async function logPageView(params: { path: string; visitorId?: string; referrer?: string | null }) {
  const isOrganic = isOrganicReferrer(params.referrer);
  await db.insert(schema.pageViews).values({
    path: params.path,
    visitorId: params.visitorId,
    referrer: params.referrer ?? undefined,
    isOrganic,
  });
}

function isOrganicReferrer(referrer?: string | null): boolean {
  if (!referrer) return false;
  try {
    const host = new URL(referrer).hostname;
    return /(^|\.)google\.|(^|\.)bing\.|(^|\.)duckduckgo\.|(^|\.)yahoo\./.test(host);
  } catch {
    return false;
  }
}

export async function getRefererHeader(): Promise<string | null> {
  const h = await headers();
  return h.get("referer");
}
