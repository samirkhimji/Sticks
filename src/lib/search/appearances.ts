// Fetches "this track appears in these sets" rows with everything a result
// card needs (DJ names, event, source platform, timestamp, confidence),
// restricted to what's safe to show the public: confidently-matched track
// appearances inside sets that finished processing.

import { eq, inArray, and, or } from "drizzle-orm";
import { db, schema } from "@/db";

export interface AppearanceRow {
  appearanceId: string;
  setId: string;
  setSlug: string;
  setTitle: string;
  sourceUrl: string;
  embedUrl: string | null;
  sourcePlatformKey: string;
  sourcePlatformName: string;
  supportsTimestampLinks: boolean;
  isDemoFixture: boolean;
  thumbnailUrl: string | null;
  durationSec: number | null;
  publishedAt: Date | null;
  yearKnown: number | null;
  tracklistCompleteness: "UNKNOWN" | "NONE" | "PARTIAL" | "FULL";
  eventId: string | null;
  eventName: string | null;
  eventSlug: string | null;
  eventType: string | null;
  timestampSec: number | null;
  timestampConfidence: "UNKNOWN" | "APPROXIMATE" | "EXACT";
  matchConfidence: number;
  viewCount: number;
  clickCount: number;
  djs: { id: string; name: string; slug: string }[];
  playUrl: string | null;
}

export async function getAppearancesForTrack(trackId: string): Promise<AppearanceRow[]> {
  const rows = await db
    .select({
      appearanceId: schema.trackAppearances.id,
      timestampSec: schema.trackAppearances.timestampSec,
      timestampConfidence: schema.trackAppearances.timestampConfidence,
      matchConfidence: schema.trackAppearances.matchConfidence,
      setId: schema.djSets.id,
      setSlug: schema.djSets.slug,
      setTitle: schema.djSets.title,
      sourceUrl: schema.djSets.sourceUrl,
      embedUrl: schema.djSets.embedUrl,
      thumbnailUrl: schema.djSets.thumbnailUrl,
      durationSec: schema.djSets.durationSec,
      publishedAt: schema.djSets.publishedAt,
      yearKnown: schema.djSets.yearKnown,
      tracklistCompleteness: schema.djSets.tracklistCompleteness,
      isDemoFixture: schema.djSets.isDemoFixture,
      viewCount: schema.djSets.viewCount,
      clickCount: schema.djSets.clickCount,
      eventId: schema.events.id,
      eventName: schema.events.name,
      eventSlug: schema.events.slug,
      eventType: schema.events.type,
      sourcePlatformKey: schema.sourcePlatforms.key,
      sourcePlatformName: schema.sourcePlatforms.name,
      supportsTimestampLinks: schema.sourcePlatforms.supportsTimestampLinks,
    })
    .from(schema.trackAppearances)
    .innerJoin(schema.djSets, eq(schema.djSets.id, schema.trackAppearances.setId))
    .innerJoin(schema.sourcePlatforms, eq(schema.sourcePlatforms.id, schema.djSets.sourcePlatformId))
    .leftJoin(schema.events, eq(schema.events.id, schema.djSets.eventId))
    .where(
      and(
        eq(schema.trackAppearances.trackId, trackId),
        eq(schema.trackAppearances.matchStatus, "AUTO_MATCHED"),
        or(eq(schema.djSets.importStatus, "PROCESSED"), eq(schema.djSets.importStatus, "PARTIAL"))
      )
    );

  if (rows.length === 0) return [];

  const setIds = [...new Set(rows.map((r) => r.setId))];
  const djRows = await db
    .select({
      setId: schema.setDjs.setId,
      djId: schema.djs.id,
      djName: schema.djs.name,
      djSlug: schema.djs.slug,
    })
    .from(schema.setDjs)
    .innerJoin(schema.djs, eq(schema.djs.id, schema.setDjs.djId))
    .where(inArray(schema.setDjs.setId, setIds));

  const djsBySet = new Map<string, { id: string; name: string; slug: string }[]>();
  for (const d of djRows) {
    const list = djsBySet.get(d.setId) ?? [];
    list.push({ id: d.djId, name: d.djName, slug: d.djSlug });
    djsBySet.set(d.setId, list);
  }

  return rows.map((r) => {
    const djs = djsBySet.get(r.setId) ?? [];
    let playUrl: string | null = null;
    if (!r.isDemoFixture && r.supportsTimestampLinks && typeof r.timestampSec === "number") {
      const adapter = ADAPTER_TIMESTAMP_BUILDERS[r.sourcePlatformKey];
      if (adapter) playUrl = adapter({ sourceUrl: r.sourceUrl, embedUrl: r.embedUrl }, r.timestampSec);
    }
    return { ...r, djs, playUrl };
  });
}

// Lazily require()'d to avoid a circular import between search and ingestion
// adapters (adapters import nothing from search, but this keeps the graph
// obviously acyclic for anyone reading the code later).
import { mixcloudAdapter } from "@/lib/ingestion/adapters/mixcloud";
import { youtubeAdapter } from "@/lib/ingestion/adapters/youtube";

const ADAPTER_TIMESTAMP_BUILDERS: Record<
  string,
  (set: { sourceUrl: string; embedUrl?: string | null }, ts: number) => string | null
> = {
  mixcloud: mixcloudAdapter.buildTimestampUrl,
  youtube: youtubeAdapter.buildTimestampUrl,
};
