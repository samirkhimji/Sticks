// Mixcloud adapter — the primary V1 source.
//
// Why Mixcloud: its public API (https://www.mixcloud.com/developers/) is
// free, keyless for read access to public cloudcasts, and — crucially —
// lets uploaders attach a *structured* tracklist to a mix: a `sections`
// array of { artist, song, start_time } markers. That is exactly the
// legitimately-available, machine-readable tracklist data this product is
// built to run on, with no scraping and no ToS problems.
//
// When a cloudcast has no `sections`, we fall back to parsing any plain-text
// timestamped tracklist the uploader put in the description (very common on
// Mixcloud) via the shared parseTimestampedText() parser. If neither is
// present, the set is stored with tracklistCompleteness = NONE rather than
// guessed at.
//
// NOTE ON THIS SANDBOX: outbound requests to api.mixcloud.com are blocked by
// this session's egress policy (see project README). fetchJson() below is
// the real, documented API call and will work in any normal deployment
// environment. `parseCloudcastPayload` is a pure function with no network
// dependency, so it is exercised directly against fixture payloads for the
// in-sandbox demo (see adapters/demoFixture.ts) — same parsing code path
// either way.

import type { DiscoveredSet, ParsedTrackEntry, SourceAdapter } from "../types";
import { parseTimestampedText } from "../parseTimestampedText";
import { WATCHED_MIXCLOUD_USERS } from "../sources.config";

const API_BASE = "https://api.mixcloud.com";
const WEB_BASE = "https://www.mixcloud.com";

export interface MixcloudSection {
  artist?: string;
  song?: string;
  start_time?: number;
  chapter?: string;
}

export interface MixcloudCloudcast {
  key: string; // e.g. "/omfo/standby-mix/"
  url: string;
  name: string;
  slug: string;
  user: { username: string; name: string; url: string };
  pictures?: { large?: string; medium?: string; thumbnail?: string };
  audio_length?: number;
  created_time?: string;
  description?: string;
  tags?: { name: string; url?: string }[];
  sections?: MixcloudSection[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function guessEventTypeFromTags(tags: string[] | undefined): DiscoveredSet["eventType"] {
  const joined = (tags ?? []).join(" ").toLowerCase();
  if (/festival/.test(joined)) return "FESTIVAL";
  if (/radio/.test(joined)) return "RADIO_SHOW";
  if (/live\b|livestream/.test(joined)) return "LIVESTREAM";
  if (/podcast/.test(joined)) return "PODCAST";
  if (/club/.test(joined)) return "CLUB";
  if (/studio/.test(joined)) return "STUDIO_MIX";
  return undefined;
}

/**
 * Mixcloud's API has no dedicated "event" field, so an event/venue name has
 * to be inferred from the cloudcast title, using the common DJ-upload
 * convention of separating parts with an em dash. This is a heuristic, not
 * a guarantee — titles that don't follow the convention simply get no event
 * attached (an unlinked set), which is the correct behavior per the spec
 * ("only expose pages containing useful actual data") rather than guessing.
 *
 *  - Festival/club sets: "<DJ or stage> — <Event name> <year?>" -> event is
 *    the part *after* the dash (e.g. "Floresta Stage — Waking Life 2024").
 *  - Recurring radio/podcast shows: "<Show name> — <Episode label>" -> the
 *    show itself is the recurring "event" and is the part *before* the dash
 *    (e.g. "Night Static Radio — Episode 12" -> event "Night Static Radio").
 */
function inferEventFromTitle(
  title: string,
  eventType: DiscoveredSet["eventType"]
): { eventName?: string; eventYear?: number } {
  const parts = title.split(" — ");
  if (parts.length < 2) return {};

  const useFirstSegment = eventType === "RADIO_SHOW" || eventType === "PODCAST";
  let segment = (useFirstSegment ? parts[0] : parts[parts.length - 1]).trim();
  segment = segment.replace(/\s*\([^)]*\)\s*$/, "").trim(); // drop trailing "(Sunrise Set)" etc.

  const yearMatch = segment.match(/\b(19|20)\d{2}\b/);
  const eventYear = yearMatch ? parseInt(yearMatch[0], 10) : undefined;
  const eventName = segment.replace(/\b(19|20)\d{2}\b/, "").replace(/\s+/g, " ").trim();

  // A radio show's "event" name shouldn't itself look like an episode number.
  if (useFirstSegment && /^(episode|ep\.?)\s*\d+$/i.test(eventName)) return {};

  return eventName ? { eventName, eventYear } : {};
}

export function cloudcastToDiscoveredSet(c: MixcloudCloudcast): DiscoveredSet {
  const eventType = guessEventTypeFromTags(c.tags?.map((t) => t.name));
  const { eventName, eventYear } = inferEventFromTitle(c.name, eventType);
  return {
    externalId: c.key,
    sourceUrl: c.url.startsWith("http") ? c.url : `${WEB_BASE}${c.key}`,
    title: c.name,
    djNames: [c.user?.name || c.user?.username].filter(Boolean) as string[],
    embedUrl: `https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(c.key)}`,
    thumbnailUrl: c.pictures?.large || c.pictures?.medium,
    description: c.description,
    durationSec: c.audio_length,
    publishedAt: c.created_time ? new Date(c.created_time) : undefined,
    eventName,
    eventYear,
    eventType,
    rawPayload: c,
  };
}

/** Pure parsing logic, no network — reused verbatim by the demo fixture adapter. */
export function parseCloudcastPayload(c: MixcloudCloudcast): ParsedTrackEntry[] {
  if (c.sections && c.sections.length > 0) {
    return c.sections
      .filter((s) => s.artist && s.song)
      .map((s, i) => ({
        position: i + 1,
        rawArtistText: s.artist!.trim(),
        rawTitleText: s.song!.trim(),
        timestampSec: typeof s.start_time === "number" ? s.start_time : undefined,
        timestampConfidence: typeof s.start_time === "number" ? "EXACT" : "UNKNOWN",
      }));
  }
  if (c.description) {
    const fromText = parseTimestampedText(c.description);
    if (fromText.length > 0) return fromText;
  }
  return [];
}

function usernameAndSlugFromUrl(url: string): { username: string; slug: string } | null {
  try {
    const u = new URL(url);
    if (!/mixcloud\.com$/.test(u.hostname.replace(/^www\./, "")) && u.hostname !== "mixcloud.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    // Path segments come back percent-encoded for non-ASCII titles (e.g.
    // "lux-fr%C3%A1gil-..."). fetchByUrl() re-encodes with
    // encodeURIComponent() before calling the API, so decode here first —
    // otherwise a title with an accented/non-ASCII character gets
    // double-encoded and the API 404s, surfacing as a false "couldn't fetch
    // metadata" rejection for a perfectly valid, existing cloudcast.
    try {
      return { username: decodeURIComponent(parts[0]), slug: decodeURIComponent(parts[1]) };
    } catch {
      return { username: parts[0], slug: parts[1] };
    }
  } catch {
    return null;
  }
}

export const mixcloudAdapter: SourceAdapter = {
  adapterKey: "mixcloud",
  platformKey: "mixcloud",
  platformName: "Mixcloud",
  baseUrl: WEB_BASE,
  supportsTimestampLinks: true,

  isEnabled() {
    // Keyless for public read access — always enabled, but obviously only
    // reachable where outbound internet to api.mixcloud.com is allowed.
    return true;
  },

  async discoverNew(limit) {
    const out: DiscoveredSet[] = [];
    for (const username of WATCHED_MIXCLOUD_USERS) {
      if (out.length >= limit) break;
      const list = await fetchJson<{ data: MixcloudCloudcast[] }>(
        `${API_BASE}/${encodeURIComponent(username)}/cloudcasts/?limit=10`
      );
      if (!list?.data) continue;
      for (const summary of list.data) {
        if (out.length >= limit) break;
        // The list endpoint doesn't reliably include `sections`/full
        // description, so fetch the detail view for the real tracklist data.
        const detail = await fetchJson<MixcloudCloudcast>(`${API_BASE}${summary.key}`);
        out.push(cloudcastToDiscoveredSet(detail ?? summary));
      }
    }
    return out;
  },

  async fetchByUrl(url) {
    const parsed = usernameAndSlugFromUrl(url);
    if (!parsed) return null;
    const detail = await fetchJson<MixcloudCloudcast>(
      `${API_BASE}/${encodeURIComponent(parsed.username)}/${encodeURIComponent(parsed.slug)}/`
    );
    if (!detail) return null;
    return cloudcastToDiscoveredSet(detail);
  },

  async parseTracklist(set) {
    return parseCloudcastPayload(set.rawPayload as MixcloudCloudcast);
  },

  buildTimestampUrl(set, timestampSec) {
    if (set.embedUrl) {
      const sep = set.embedUrl.includes("?") ? "&" : "?";
      return `${set.embedUrl}${sep}start=${Math.max(0, Math.floor(timestampSec))}`;
    }
    return null;
  },
};
