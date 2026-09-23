// Thin client for the MusicBrainz web service (https://musicbrainz.org/ws/2/).
// MusicBrainz is free, keyless, and its license (CC0/ODbL-ish, see their
// licensing page) permits this kind of reuse. We use it purely for
// *canonical metadata and alias discovery* — it never invents track
// appearances, it only helps us realize that "OMFO" and "Our Man From
// Odessa" are the same artist.
//
// Etiquette we follow (per MusicBrainz's API guidelines):
//  - a descriptive User-Agent identifying the app + contact
//  - at most ~1 request/second
//  - graceful failure: a network error here must never fail an ingestion
//    run, it should just mean "no extra aliases found this time"
//
// NOTE: this session's sandbox has no outbound access to musicbrainz.org
// (locked-down egress), so this client cannot be exercised live here. It is
// written against MusicBrainz's real, documented JSON API and will work as
// soon as it runs somewhere with normal internet access (any standard
// deploy target). Every call is wrapped so failures degrade gracefully.

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Sticks/0.1 (https://example.com; contact: admin@example.com)";

let lastRequestAt = 0;
async function rateLimit() {
  const minGapMs = 1100;
  const wait = lastRequestAt + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function mbFetch<T>(path: string): Promise<T | null> {
  try {
    await rateLimit();
    const res = await fetch(`${MB_BASE}${path}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      // MusicBrainz can be slow under load; fail fast rather than hang an
      // ingestion job.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // Network unavailable, timeout, DNS failure, etc. — normalization must
    // continue without MusicBrainz enrichment rather than throw.
    return null;
  }
}

export interface MbArtistSearchResult {
  id: string;
  name: string;
  score: number;
  disambiguation?: string;
  country?: string;
  aliases?: { name: string; "sort-name"?: string; primary?: boolean }[];
}

export async function searchMusicBrainzArtist(
  name: string
): Promise<MbArtistSearchResult[]> {
  const q = encodeURIComponent(`artist:"${name}"`);
  const data = await mbFetch<{ artists: MbArtistSearchResult[] }>(
    `/artist/?query=${q}&fmt=json&limit=5`
  );
  return data?.artists ?? [];
}

export async function getMusicBrainzArtistAliases(
  mbid: string
): Promise<string[]> {
  const data = await mbFetch<{ aliases?: { name: string }[] }>(
    `/artist/${mbid}?inc=aliases&fmt=json`
  );
  return data?.aliases?.map((a) => a.name) ?? [];
}

export interface MbRecordingSearchResult {
  id: string;
  title: string;
  score: number;
  length?: number;
  "artist-credit"?: { name: string }[];
  isrcs?: string[];
}

export async function searchMusicBrainzRecording(
  title: string,
  artist?: string
): Promise<MbRecordingSearchResult[]> {
  const parts = [`recording:"${title}"`];
  if (artist) parts.push(`artist:"${artist}"`);
  const q = encodeURIComponent(parts.join(" AND "));
  const data = await mbFetch<{ recordings: MbRecordingSearchResult[] }>(
    `/recording/?query=${q}&fmt=json&limit=5`
  );
  return data?.recordings ?? [];
}
