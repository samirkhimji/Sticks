// Data loaders for the public detail pages: track, artist, DJ, set, event.
// Kept separate from `query.ts` (search box) and `rank.ts` (ranking math).

import { eq, and, or, inArray, sql, desc } from "drizzle-orm";
import { db, schema } from "@/db";

export async function getTrackBySlug(slug: string) {
  const [track] = await db.select().from(schema.tracks).where(eq(schema.tracks.slug, slug)).limit(1);
  if (!track) return null;
  const artistLinks = await db
    .select({ id: schema.artists.id, name: schema.artists.name, slug: schema.artists.slug, role: schema.trackArtists.role })
    .from(schema.trackArtists)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.trackArtists.artistId))
    .where(eq(schema.trackArtists.trackId, track.id));
  return { ...track, artists: artistLinks };
}

export async function getArtistBySlug(slug: string) {
  const [artist] = await db.select().from(schema.artists).where(eq(schema.artists.slug, slug)).limit(1);
  if (!artist) return null;

  const tracks = await db
    .select({ id: schema.tracks.id, title: schema.tracks.title, slug: schema.tracks.slug })
    .from(schema.trackArtists)
    .innerJoin(schema.tracks, eq(schema.tracks.id, schema.trackArtists.trackId))
    .where(eq(schema.trackArtists.artistId, artist.id));

  const aliasRows = await db
    .select({ alias: schema.artistAliases.alias })
    .from(schema.artistAliases)
    .where(eq(schema.artistAliases.artistId, artist.id));
  const aliases = aliasRows.map((a) => a.alias);

  if (tracks.length === 0) {
    return { ...artist, tracks: [] as { id: string; title: string; slug: string; appearanceCount: number }[], aliases };
  }

  const trackIds = tracks.map((t) => t.id);
  const counts = await db
    .select({
      trackId: schema.trackAppearances.trackId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(schema.trackAppearances)
    .innerJoin(schema.djSets, eq(schema.djSets.id, schema.trackAppearances.setId))
    .where(
      and(
        inArray(schema.trackAppearances.trackId, trackIds),
        eq(schema.trackAppearances.matchStatus, "AUTO_MATCHED"),
        or(eq(schema.djSets.importStatus, "PROCESSED"), eq(schema.djSets.importStatus, "PARTIAL"))
      )
    )
    .groupBy(schema.trackAppearances.trackId);

  const countMap = new Map(counts.map((c) => [c.trackId, Number(c.count)]));
  const tracksWithCounts = tracks
    .map((t) => ({ ...t, appearanceCount: countMap.get(t.id) ?? 0 }))
    .filter((t) => t.appearanceCount > 0)
    .sort((a, b) => b.appearanceCount - a.appearanceCount);

  return { ...artist, tracks: tracksWithCounts, aliases };
}

export async function getDjBySlug(slug: string) {
  const [dj] = await db.select().from(schema.djs).where(eq(schema.djs.slug, slug)).limit(1);
  if (!dj) return null;

  const sets = await db
    .select({
      id: schema.djSets.id,
      title: schema.djSets.title,
      slug: schema.djSets.slug,
      publishedAt: schema.djSets.publishedAt,
      yearKnown: schema.djSets.yearKnown,
      durationSec: schema.djSets.durationSec,
      isDemoFixture: schema.djSets.isDemoFixture,
      eventName: schema.events.name,
      eventSlug: schema.events.slug,
      sourcePlatformName: schema.sourcePlatforms.name,
    })
    .from(schema.setDjs)
    .innerJoin(schema.djSets, eq(schema.djSets.id, schema.setDjs.setId))
    .innerJoin(schema.sourcePlatforms, eq(schema.sourcePlatforms.id, schema.djSets.sourcePlatformId))
    .leftJoin(schema.events, eq(schema.events.id, schema.djSets.eventId))
    .where(
      and(
        eq(schema.setDjs.djId, dj.id),
        or(eq(schema.djSets.importStatus, "PROCESSED"), eq(schema.djSets.importStatus, "PARTIAL"))
      )
    )
    .orderBy(desc(schema.djSets.publishedAt));

  return { ...dj, sets };
}

export async function getEventBySlug(slug: string) {
  const [event] = await db.select().from(schema.events).where(eq(schema.events.slug, slug)).limit(1);
  if (!event) return null;
  const sets = await db
    .select({
      id: schema.djSets.id,
      title: schema.djSets.title,
      slug: schema.djSets.slug,
      publishedAt: schema.djSets.publishedAt,
      isDemoFixture: schema.djSets.isDemoFixture,
      sourcePlatformName: schema.sourcePlatforms.name,
    })
    .from(schema.djSets)
    .innerJoin(schema.sourcePlatforms, eq(schema.sourcePlatforms.id, schema.djSets.sourcePlatformId))
    .where(
      and(
        eq(schema.djSets.eventId, event.id),
        or(eq(schema.djSets.importStatus, "PROCESSED"), eq(schema.djSets.importStatus, "PARTIAL"))
      )
    );
  if (sets.length === 0) return null; // don't expose thin/empty event pages
  return { ...event, sets };
}

export async function getSetBySlug(slug: string) {
  const [set] = await db.select().from(schema.djSets).where(eq(schema.djSets.slug, slug)).limit(1);
  if (!set) return null;

  const [platform] = await db
    .select()
    .from(schema.sourcePlatforms)
    .where(eq(schema.sourcePlatforms.id, set.sourcePlatformId))
    .limit(1);

  const event = set.eventId
    ? (await db.select().from(schema.events).where(eq(schema.events.id, set.eventId)).limit(1))[0] ?? null
    : null;

  const djs = await db
    .select({ id: schema.djs.id, name: schema.djs.name, slug: schema.djs.slug })
    .from(schema.setDjs)
    .innerJoin(schema.djs, eq(schema.djs.id, schema.setDjs.djId))
    .where(eq(schema.setDjs.setId, set.id));

  const appearances = await db
    .select({
      id: schema.trackAppearances.id,
      position: schema.trackAppearances.position,
      rawArtistText: schema.trackAppearances.rawArtistText,
      rawTitleText: schema.trackAppearances.rawTitleText,
      timestampSec: schema.trackAppearances.timestampSec,
      timestampConfidence: schema.trackAppearances.timestampConfidence,
      matchStatus: schema.trackAppearances.matchStatus,
      matchConfidence: schema.trackAppearances.matchConfidence,
      trackId: schema.trackAppearances.trackId,
      trackSlug: schema.tracks.slug,
      trackTitle: schema.tracks.title,
      artistId: schema.trackAppearances.matchedArtistId,
      artistSlug: schema.artists.slug,
      artistName: schema.artists.name,
    })
    .from(schema.trackAppearances)
    .leftJoin(schema.tracks, eq(schema.tracks.id, schema.trackAppearances.trackId))
    .leftJoin(schema.artists, eq(schema.artists.id, schema.trackAppearances.matchedArtistId))
    .where(eq(schema.trackAppearances.setId, set.id))
    .orderBy(schema.trackAppearances.position);

  return { ...set, platform, event, djs, appearances };
}

export async function incrementSetView(setId: string) {
  await db
    .update(schema.djSets)
    .set({ viewCount: sql`${schema.djSets.viewCount} + 1` })
    .where(eq(schema.djSets.id, setId));
}

export async function incrementSetClick(setId: string) {
  await db
    .update(schema.djSets)
    .set({ clickCount: sql`${schema.djSets.clickCount} + 1` })
    .where(eq(schema.djSets.id, setId));
}
