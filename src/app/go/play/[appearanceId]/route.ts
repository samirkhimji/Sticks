import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { logClick, getOrCreateVisitorId } from "@/lib/analytics";
import { getAdapter } from "@/lib/ingestion/registry";

export async function GET(_req: Request, { params }: { params: Promise<{ appearanceId: string }> }) {
  const { appearanceId } = await params;

  const [row] = await db
    .select({
      timestampSec: schema.trackAppearances.timestampSec,
      setId: schema.djSets.id,
      setSlug: schema.djSets.slug,
      sourceUrl: schema.djSets.sourceUrl,
      embedUrl: schema.djSets.embedUrl,
      isDemoFixture: schema.djSets.isDemoFixture,
      adapterKey: schema.sourcePlatforms.adapterKey,
    })
    .from(schema.trackAppearances)
    .innerJoin(schema.djSets, eq(schema.djSets.id, schema.trackAppearances.setId))
    .innerJoin(schema.sourcePlatforms, eq(schema.sourcePlatforms.id, schema.djSets.sourcePlatformId))
    .where(eq(schema.trackAppearances.id, appearanceId))
    .limit(1);

  if (!row) return NextResponse.redirect(new URL("/", _req.url));

  const visitorId = await getOrCreateVisitorId();
  await Promise.all([
    logClick({ type: "TIMESTAMP_PLAY", targetId: appearanceId, visitorId }),
    db
      .update(schema.djSets)
      .set({ clickCount: sql`${schema.djSets.clickCount} + 1` })
      .where(eq(schema.djSets.id, row.setId)),
  ]).catch(() => {});

  let target = `/set/${row.setSlug}`;
  if (!row.isDemoFixture && row.timestampSec != null) {
    const adapter = getAdapter(row.adapterKey);
    const url = adapter?.buildTimestampUrl({ sourceUrl: row.sourceUrl, embedUrl: row.embedUrl }, row.timestampSec);
    if (url) target = url;
  }

  return NextResponse.redirect(target.startsWith("http") ? target : new URL(target, _req.url));
}
