// The homepage search box logic: tolerant of imperfect queries (typos,
// punctuation, alternate artist names) and decides whether the query looks
// like a track, an artist, both, or neither — without ever hard-coding any
// specific query. Everything here runs against whatever is in the catalog.

import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeText, normalizeAcronym } from "@/lib/normalize/text";

export interface TrackHit {
  id: string;
  title: string;
  slug: string;
  score: number;
  artistNames: string[];
}
export interface ArtistHit {
  id: string;
  name: string;
  slug: string;
  score: number;
}
export interface DjHit {
  id: string;
  name: string;
  slug: string;
  score: number;
}

export interface SearchOutcome {
  query: string;
  exactTrack: TrackHit | null;
  exactArtist: ArtistHit | null;
  trackMatches: TrackHit[];
  artistMatches: ArtistHit[];
  djMatches: DjHit[];
}

const EXACT_THRESHOLD = 0.999;
const FUZZY_MIN = 0.25;

export async function search(rawQuery: string): Promise<SearchOutcome> {
  const q = rawQuery.trim();
  const normalized = normalizeText(q);
  const acronym = normalizeAcronym(q);

  const trackRows = await db.execute(sql`
    SELECT t.id, t.title, t.slug,
      GREATEST(
        similarity(t.normalized_title, ${normalized}),
        COALESCE((SELECT MAX(similarity(ta.normalized_alias, ${normalized})) FROM track_aliases ta WHERE ta.track_id = t.id), 0)
      ) AS score
    FROM tracks t
    WHERE t.normalized_title % ${normalized}
       OR EXISTS (SELECT 1 FROM track_aliases ta WHERE ta.track_id = t.id AND ta.normalized_alias % ${normalized})
       OR t.normalized_title = ${normalized}
    ORDER BY score DESC
    LIMIT 12
  `);

  const artistRows = await db.execute(sql`
    SELECT a.id, a.name, a.slug,
      GREATEST(
        similarity(a.normalized_name, ${normalized}),
        similarity(a.normalized_name, ${acronym}),
        COALESCE((SELECT MAX(similarity(aa.normalized_alias, ${normalized})) FROM artist_aliases aa WHERE aa.artist_id = a.id), 0)
      ) AS score
    FROM artists a
    WHERE a.normalized_name % ${normalized}
       OR a.normalized_name % ${acronym}
       OR a.normalized_name = ${normalized}
       OR a.normalized_name = ${acronym}
       OR EXISTS (SELECT 1 FROM artist_aliases aa WHERE aa.artist_id = a.id AND (aa.normalized_alias % ${normalized} OR aa.normalized_alias = ${normalized}))
    ORDER BY score DESC
    LIMIT 12
  `);

  const djRows = await db.execute(sql`
    SELECT d.id, d.name, d.slug,
      GREATEST(
        similarity(d.normalized_name, ${normalized}),
        COALESCE((SELECT MAX(similarity(da.normalized_alias, ${normalized})) FROM dj_aliases da WHERE da.dj_id = d.id), 0)
      ) AS score
    FROM djs d
    WHERE d.normalized_name % ${normalized}
       OR d.normalized_name = ${normalized}
       OR EXISTS (SELECT 1 FROM dj_aliases da WHERE da.dj_id = d.id AND da.normalized_alias % ${normalized})
    ORDER BY score DESC
    LIMIT 8
  `);

  const trackIds = (trackRows.rows as any[]).map((r) => r.id);
  const artistsByTrack = trackIds.length
    ? await db
        .select({
          trackId: schema.trackArtists.trackId,
          artistName: schema.artists.name,
        })
        .from(schema.trackArtists)
        .innerJoin(schema.artists, eq(schema.artists.id, schema.trackArtists.artistId))
        .where(sql`${schema.trackArtists.trackId} IN (${sql.join(trackIds.map((id) => sql`${id}`), sql`, `)})`)
    : [];
  const artistNamesByTrack = new Map<string, string[]>();
  for (const row of artistsByTrack) {
    const list = artistNamesByTrack.get(row.trackId) ?? [];
    list.push(row.artistName);
    artistNamesByTrack.set(row.trackId, list);
  }

  const trackMatches: TrackHit[] = (trackRows.rows as any[])
    .map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      score: Number(r.score),
      artistNames: artistNamesByTrack.get(r.id) ?? [],
    }))
    .filter((t) => t.score >= FUZZY_MIN)
    .sort((a, b) => b.score - a.score);

  const artistMatches: ArtistHit[] = (artistRows.rows as any[])
    .map((r) => ({ id: r.id, name: r.name, slug: r.slug, score: Number(r.score) }))
    .filter((a) => a.score >= FUZZY_MIN)
    .sort((a, b) => b.score - a.score);

  const djMatches: DjHit[] = (djRows.rows as any[])
    .map((r) => ({ id: r.id, name: r.name, slug: r.slug, score: Number(r.score) }))
    .filter((d) => d.score >= FUZZY_MIN)
    .sort((a, b) => b.score - a.score);

  const exactTrack = trackMatches.find((t) => t.score >= EXACT_THRESHOLD) ?? null;
  const exactArtist = artistMatches.find((a) => a.score >= EXACT_THRESHOLD) ?? null;

  return { query: q, exactTrack, exactArtist, trackMatches, artistMatches, djMatches };
}
