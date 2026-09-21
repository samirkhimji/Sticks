// YouTube adapter — architected fully against the real YouTube Data API v3,
// but disabled until a YOUTUBE_API_KEY is provided (none was available for
// this V1 build). Many DJ sets are uploaded to YouTube with a timestamped
// tracklist either in the description or as official "chapters" (which
// YouTube derives from description timestamps that follow their format).
// We reuse the same parseTimestampedText() parser for both.
//
// Getting a key: https://console.cloud.google.com/apis/library/youtube.googleapis.com
// (free quota is generous for search + video lookups at this scale).

import type { DiscoveredSet, SourceAdapter } from "../types";
import { parseTimestampedText } from "../parseTimestampedText";
import { YOUTUBE_SEARCH_QUERIES, YOUTUBE_CHANNEL_IDS } from "../sources.config";

const API_BASE = "https://www.googleapis.com/youtube/v3";

function apiKey() {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface YtSearchItem {
  id: { videoId?: string };
}
interface YtVideoItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: { high?: { url: string }; medium?: { url: string } };
    tags?: string[];
  };
  contentDetails: { duration: string }; // ISO 8601 duration, e.g. PT1H32M
}

function isoDurationToSeconds(iso: string): number | undefined {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const [, h, mi, s] = m;
  return (Number(h || 0) * 3600) + (Number(mi || 0) * 60) + Number(s || 0);
}

function videoToDiscoveredSet(v: YtVideoItem): DiscoveredSet {
  return {
    externalId: v.id,
    sourceUrl: `https://www.youtube.com/watch?v=${v.id}`,
    title: v.snippet.title,
    djNames: [v.snippet.channelTitle],
    embedUrl: `https://www.youtube.com/embed/${v.id}`,
    thumbnailUrl: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url,
    description: v.snippet.description,
    durationSec: isoDurationToSeconds(v.contentDetails.duration),
    publishedAt: new Date(v.snippet.publishedAt),
    rawPayload: v,
  };
}

export const youtubeAdapter: SourceAdapter = {
  adapterKey: "youtube",
  platformKey: "youtube",
  platformName: "YouTube",
  baseUrl: "https://www.youtube.com",
  supportsTimestampLinks: true,

  isEnabled() {
    return !!apiKey();
  },
  disabledReason() {
    return apiKey() ? undefined : "Missing YOUTUBE_API_KEY environment variable";
  },

  async discoverNew(limit) {
    const key = apiKey();
    if (!key) return [];
    const ids: string[] = [];
    for (const q of YOUTUBE_SEARCH_QUERIES) {
      if (ids.length >= limit) break;
      const res = await fetchJson<{ items: YtSearchItem[] }>(
        `${API_BASE}/search?part=id&type=video&maxResults=10&q=${encodeURIComponent(q)}&key=${key}`
      );
      for (const item of res?.items ?? []) {
        if (item.id.videoId) ids.push(item.id.videoId);
      }
    }
    for (const channelId of YOUTUBE_CHANNEL_IDS) {
      if (ids.length >= limit) break;
      const res = await fetchJson<{ items: YtSearchItem[] }>(
        `${API_BASE}/search?part=id&type=video&maxResults=10&channelId=${channelId}&order=date&key=${key}`
      );
      for (const item of res?.items ?? []) {
        if (item.id.videoId) ids.push(item.id.videoId);
      }
    }
    if (ids.length === 0) return [];
    const details = await fetchJson<{ items: YtVideoItem[] }>(
      `${API_BASE}/videos?part=snippet,contentDetails&id=${ids.slice(0, limit).join(",")}&key=${key}`
    );
    return (details?.items ?? []).map(videoToDiscoveredSet);
  },

  async fetchByUrl(url) {
    const key = apiKey();
    if (!key) return null;
    let videoId: string | null = null;
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) videoId = u.pathname.slice(1);
      else videoId = u.searchParams.get("v");
    } catch {
      return null;
    }
    if (!videoId) return null;
    const details = await fetchJson<{ items: YtVideoItem[] }>(
      `${API_BASE}/videos?part=snippet,contentDetails&id=${videoId}&key=${key}`
    );
    const item = details?.items?.[0];
    return item ? videoToDiscoveredSet(item) : null;
  },

  async parseTracklist(set) {
    return parseTimestampedText(set.description ?? "");
  },

  buildTimestampUrl(set, timestampSec) {
    const sep = set.sourceUrl.includes("?") ? "&" : "?";
    return `${set.sourceUrl}${sep}t=${Math.max(0, Math.floor(timestampSec))}s`;
  },
};
