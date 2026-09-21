// Entity resolution: turns raw tracklist text ("O.M.F.O.", "Standby") into
// links to canonical Artist / Track rows, or — when nothing matches well
// enough — creates new canonical rows (this is how the catalog grows) or
// parks the decision in the review queue when it's genuinely ambiguous.
//
// This is the one place ingestion adapters call into to avoid ever writing
// duplicate "OMFO" / "O.M.F.O." rows. It never merges low-confidence matches
// silently: below AUTO_THRESHOLD, a human decides via the admin review queue.

import { sql, eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeText, normalizeAcronym, slugify, levenshteinSimilarity } from "./text";
import { searchMusicBrainzArtist, getMusicBrainzArtistAliases } from "./musicbrainz";

export const MATCH_THRESHOLDS = {
  AUTO: 0.86, // >= this: accept automatically, no human needed
  REVIEW: 0.55, // between REVIEW and AUTO: park in review queue
  // below REVIEW: treated as a genuinely new, distinct entity
};

export type ResolveStatus = "exact" | "auto_fuzzy" | "review" | "created";

export interface ResolveResult {
  entityId: string | null; // null only when status === "review" and nothing is linked yet
  confidence: number;
  status: ResolveStatus;
  reviewItemId?: string;
}

async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>) {
  let candidate = slugify(base);
  let n = 2;
  while (await exists(candidate)) {
    candidate = `${slugify(base)}-${n}`;
    n++;
  }
  return candidate;
}

interface FuzzyCandidate {
  id: string;
  name: string;
  score: number;
  viaAlias: boolean;
}

/** Trigram-similarity search across an entity's canonical name + its aliases. */
async function fuzzyCandidates(
  kind: "artist" | "track" | "dj",
  normalized: string
): Promise<FuzzyCandidate[]> {
  if (!normalized) return [];
  const table =
    kind === "artist" ? "artists" : kind === "track" ? "tracks" : "djs";
  const nameCol = kind === "track" ? "title" : "name";
  const normCol = kind === "track" ? "normalized_title" : "normalized_name";
  const aliasTable = `${table === "artists" ? "artist" : table === "tracks" ? "track" : "dj"}_aliases`;
  const fkCol = `${table === "artists" ? "artist" : table === "tracks" ? "track" : "dj"}_id`;

  // Table/column names here come from the fixed `kind` switch above, never
  // from user input; the actual search value is always bound as a real
  // query parameter (never string-concatenated) via the sql`` template.
  const direct = await db.execute(sql`
    SELECT id, ${sql.raw(nameCol)} AS name, similarity(${sql.raw(normCol)}, ${normalized}) AS score, false AS via_alias
    FROM ${sql.raw(table)}
    WHERE ${sql.raw(normCol)} % ${normalized}
    ORDER BY score DESC
    LIMIT 5
  `);

  const viaAlias = await db.execute(sql`
    SELECT t.id AS id, t.${sql.raw(nameCol)} AS name, similarity(a.normalized_alias, ${normalized}) AS score, true AS via_alias
    FROM ${sql.raw(aliasTable)} a
    JOIN ${sql.raw(table)} t ON t.id = a.${sql.raw(fkCol)}
    WHERE a.normalized_alias % ${normalized}
    ORDER BY score DESC
    LIMIT 5
  `);

  const rows = [...(direct.rows as any[]), ...(viaAlias.rows as any[])];
  const best = new Map<string, FuzzyCandidate>();
  for (const r of rows) {
    const score = Number(r.score);
    const existing = best.get(r.id);
    if (!existing || score > existing.score) {
      best.set(r.id, { id: r.id, name: r.name, score, viaAlias: r.via_alias });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Artist resolution
// ---------------------------------------------------------------------------

export async function resolveArtist(rawName: string): Promise<ResolveResult> {
  const name = rawName.trim();
  const normalized = normalizeText(name);
  const acronymKey = normalizeAcronym(name);

  // 1. Exact match on canonical name or normalized acronym form
  const [exactByName] = await db
    .select()
    .from(schema.artists)
    .where(eq(schema.artists.normalizedName, normalized))
    .limit(1);
  if (exactByName) return { entityId: exactByName.id, confidence: 1, status: "exact" };

  if (acronymKey && acronymKey !== normalized) {
    const [exactByAcronym] = await db
      .select()
      .from(schema.artists)
      .where(eq(schema.artists.normalizedName, acronymKey))
      .limit(1);
    if (exactByAcronym)
      return { entityId: exactByAcronym.id, confidence: 0.98, status: "exact" };
  }

  // 2. Exact match on a known alias (this is how "Our Man From Odessa" ->
  //    OMFO resolves, once that alias exists — from MusicBrainz or manual
  //    curation, since no string-similarity metric connects those two forms).
  const [exactAlias] = await db
    .select({ artistId: schema.artistAliases.artistId })
    .from(schema.artistAliases)
    .where(eq(schema.artistAliases.normalizedAlias, normalized))
    .limit(1);
  if (exactAlias) return { entityId: exactAlias.artistId, confidence: 1, status: "exact" };

  // 3. Fuzzy trigram match against existing catalog
  const candidates = await fuzzyCandidates("artist", normalized);
  const best = candidates[0];
  if (best && best.score >= MATCH_THRESHOLDS.AUTO) {
    await addArtistAliasIfNew(best.id, name, "INGESTION", best.score);
    return { entityId: best.id, confidence: best.score, status: "auto_fuzzy" };
  }
  if (best && best.score >= MATCH_THRESHOLDS.REVIEW) {
    const [item] = await db
      .insert(schema.reviewQueueItems)
      .values({
        type: "ARTIST_MATCH",
        entityId: best.id,
        details: {
          rawName: name,
          candidateArtistId: best.id,
          candidateName: best.name,
          score: best.score,
        },
      })
      .returning();
    return { entityId: null, confidence: best.score, status: "review", reviewItemId: item.id };
  }

  // 4. Nothing close enough exists — this is new catalog data, create it.
  const slug = await uniqueSlug(name, async (s) => {
    const [row] = await db.select({ id: schema.artists.id }).from(schema.artists).where(eq(schema.artists.slug, s)).limit(1);
    return !!row;
  });
  const [created] = await db
    .insert(schema.artists)
    .values({ name, slug, normalizedName: normalized })
    .returning();

  // Best-effort MusicBrainz enrichment (no-op if offline/unreachable).
  enrichArtistFromMusicBrainz(created.id, name).catch(() => {});

  return { entityId: created.id, confidence: 1, status: "created" };
}

async function addArtistAliasIfNew(
  artistId: string,
  alias: string,
  source: "MUSICBRAINZ" | "INGESTION" | "MANUAL" | "USER_SUBMITTED",
  confidence: number
) {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return;
  await db
    .insert(schema.artistAliases)
    .values({ artistId, alias, normalizedAlias, source, confidence })
    .onConflictDoNothing();
}

async function enrichArtistFromMusicBrainz(artistId: string, name: string) {
  const results = await searchMusicBrainzArtist(name);
  const top = results[0];
  if (!top || top.score < 90) return; // MB's own 0-100 confidence score
  await db
    .update(schema.artists)
    .set({ mbid: top.id, disambiguation: top.disambiguation, countryCode: top.country })
    .where(and(eq(schema.artists.id, artistId), sql`${schema.artists.mbid} IS NULL`));
  const aliases = await getMusicBrainzArtistAliases(top.id);
  for (const a of aliases) {
    await addArtistAliasIfNew(artistId, a, "MUSICBRAINZ", 0.95);
  }
}

// ---------------------------------------------------------------------------
// Track resolution
// ---------------------------------------------------------------------------

export async function resolveTrack(
  rawTitle: string,
  primaryArtistId: string | null
): Promise<ResolveResult> {
  const title = rawTitle.trim();
  const normalized = normalizeText(title);

  const [exactByTitle] = await db
    .select({ id: schema.tracks.id, trackId: schema.tracks.id })
    .from(schema.tracks)
    .innerJoin(schema.trackArtists, eq(schema.trackArtists.trackId, schema.tracks.id))
    .where(
      and(
        eq(schema.tracks.normalizedTitle, normalized),
        primaryArtistId ? eq(schema.trackArtists.artistId, primaryArtistId) : sql`true`
      )
    )
    .limit(1);
  if (exactByTitle) return { entityId: exactByTitle.trackId, confidence: 1, status: "exact" };

  const [exactAlias] = await db
    .select({ trackId: schema.trackAliases.trackId })
    .from(schema.trackAliases)
    .where(eq(schema.trackAliases.normalizedAlias, normalized))
    .limit(1);
  if (exactAlias) return { entityId: exactAlias.trackId, confidence: 1, status: "exact" };

  const candidates = await fuzzyCandidates("track", normalized);
  // If we know the artist, prefer a candidate already linked to them.
  let best = candidates[0];
  if (primaryArtistId && candidates.length) {
    const linked = await db
      .select({ trackId: schema.trackArtists.trackId })
      .from(schema.trackArtists)
      .where(eq(schema.trackArtists.artistId, primaryArtistId));
    const linkedIds = new Set(linked.map((l) => l.trackId));
    const artistMatch = candidates.find((c) => linkedIds.has(c.id));
    if (artistMatch && artistMatch.score >= MATCH_THRESHOLDS.REVIEW - 0.1) best = artistMatch;
  }

  if (best && best.score >= MATCH_THRESHOLDS.AUTO) {
    await db
      .insert(schema.trackAliases)
      .values({
        trackId: best.id,
        alias: title,
        normalizedAlias: normalized,
        source: "INGESTION",
        confidence: best.score,
      })
      .onConflictDoNothing();
    return { entityId: best.id, confidence: best.score, status: "auto_fuzzy" };
  }
  if (best && best.score >= MATCH_THRESHOLDS.REVIEW) {
    const [item] = await db
      .insert(schema.reviewQueueItems)
      .values({
        type: "TRACK_MATCH",
        entityId: best.id,
        details: { rawTitle: title, candidateTrackId: best.id, score: best.score },
      })
      .returning();
    return { entityId: null, confidence: best.score, status: "review", reviewItemId: item.id };
  }

  const slug = await uniqueSlug(title, async (s) => {
    const [row] = await db.select({ id: schema.tracks.id }).from(schema.tracks).where(eq(schema.tracks.slug, s)).limit(1);
    return !!row;
  });
  const [created] = await db
    .insert(schema.tracks)
    .values({ title, slug, normalizedTitle: normalized })
    .returning();

  if (primaryArtistId) {
    await db
      .insert(schema.trackArtists)
      .values({ trackId: created.id, artistId: primaryArtistId, role: "PRIMARY" })
      .onConflictDoNothing();
  }

  return { entityId: created.id, confidence: 1, status: "created" };
}

// ---------------------------------------------------------------------------
// DJ resolution (same shape, DJs are simpler — no "track title" ambiguity)
// ---------------------------------------------------------------------------

export async function resolveDj(rawName: string): Promise<ResolveResult> {
  const name = rawName.trim();
  const normalized = normalizeText(name);

  const [exact] = await db
    .select()
    .from(schema.djs)
    .where(eq(schema.djs.normalizedName, normalized))
    .limit(1);
  if (exact) return { entityId: exact.id, confidence: 1, status: "exact" };

  const [exactAlias] = await db
    .select({ djId: schema.djAliases.djId })
    .from(schema.djAliases)
    .where(eq(schema.djAliases.normalizedAlias, normalized))
    .limit(1);
  if (exactAlias) return { entityId: exactAlias.djId, confidence: 1, status: "exact" };

  const candidates = await fuzzyCandidates("dj", normalized);
  const best = candidates[0];
  if (best && best.score >= MATCH_THRESHOLDS.AUTO) {
    await db
      .insert(schema.djAliases)
      .values({ djId: best.id, alias: name, normalizedAlias: normalized, source: "INGESTION", confidence: best.score })
      .onConflictDoNothing();
    return { entityId: best.id, confidence: best.score, status: "auto_fuzzy" };
  }
  if (best && best.score >= MATCH_THRESHOLDS.REVIEW) {
    const [item] = await db
      .insert(schema.reviewQueueItems)
      .values({
        type: "DJ_MATCH",
        entityId: best.id,
        details: { rawName: name, candidateDjId: best.id, candidateName: best.name, score: best.score },
      })
      .returning();
    return { entityId: null, confidence: best.score, status: "review", reviewItemId: item.id };
  }

  const slug = await uniqueSlug(name, async (s) => {
    const [row] = await db.select({ id: schema.djs.id }).from(schema.djs).where(eq(schema.djs.slug, s)).limit(1);
    return !!row;
  });
  const [created] = await db.insert(schema.djs).values({ name, slug, normalizedName: normalized }).returning();
  return { entityId: created.id, confidence: 1, status: "created" };
}

// ---------------------------------------------------------------------------
// Forced creation — used by admin review-queue "reject" decisions, where a
// human has just confirmed the raw text is *not* the suggested candidate.
// Bypasses fuzzy matching entirely (which would just re-find that same
// candidate) and creates a genuinely new canonical row.
// ---------------------------------------------------------------------------

export async function forceCreateArtist(rawName: string): Promise<string> {
  const name = rawName.trim();
  const normalized = normalizeText(name);
  const slug = await uniqueSlug(name, async (s) => {
    const [row] = await db.select({ id: schema.artists.id }).from(schema.artists).where(eq(schema.artists.slug, s)).limit(1);
    return !!row;
  });
  const [created] = await db.insert(schema.artists).values({ name, slug, normalizedName: normalized }).returning();
  return created.id;
}

export async function forceCreateTrack(rawTitle: string, primaryArtistId: string | null): Promise<string> {
  const title = rawTitle.trim();
  const normalized = normalizeText(title);
  const slug = await uniqueSlug(title, async (s) => {
    const [row] = await db.select({ id: schema.tracks.id }).from(schema.tracks).where(eq(schema.tracks.slug, s)).limit(1);
    return !!row;
  });
  const [created] = await db.insert(schema.tracks).values({ title, slug, normalizedTitle: normalized }).returning();
  if (primaryArtistId) {
    await db.insert(schema.trackArtists).values({ trackId: created.id, artistId: primaryArtistId, role: "PRIMARY" }).onConflictDoNothing();
  }
  return created.id;
}

export async function forceCreateDj(rawName: string): Promise<string> {
  const name = rawName.trim();
  const normalized = normalizeText(name);
  const slug = await uniqueSlug(name, async (s) => {
    const [row] = await db.select({ id: schema.djs.id }).from(schema.djs).where(eq(schema.djs.slug, s)).limit(1);
    return !!row;
  });
  const [created] = await db.insert(schema.djs).values({ name, slug, normalizedName: normalized }).returning();
  return created.id;
}

export { levenshteinSimilarity };
