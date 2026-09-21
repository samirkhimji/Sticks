import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAppearancesForTrack } from "@/lib/search/appearances";
import { scoreAppearances, weightedRandomPick } from "@/lib/search/rank";
import { logClick, getOrCreateVisitorId } from "@/lib/analytics";

export async function GET(req: Request, { params }: { params: Promise<{ trackSlug: string }> }) {
  const { trackSlug } = await params;
  const [track] = await db.select({ id: schema.tracks.id }).from(schema.tracks).where(eq(schema.tracks.slug, trackSlug)).limit(1);
  if (!track) return NextResponse.redirect(new URL("/", req.url));

  const rows = await getAppearancesForTrack(track.id);
  const pick = weightedRandomPick(scoreAppearances(rows));
  if (!pick) return NextResponse.redirect(new URL(`/track/${trackSlug}`, req.url));

  const visitorId = await getOrCreateVisitorId();
  await logClick({ type: "RANDOM_SET", targetId: pick.setId, visitorId }).catch(() => {});

  return NextResponse.redirect(new URL(`/set/${pick.setSlug}`, req.url));
}
