// Approved sources. This is the one file an operator edits to grow
// coverage — no adapter code changes needed to watch a new Mixcloud
// account, only this list (or, for platforms with a search API like
// YouTube, the query/channel list below).
//
// Every account here should be one you have a legitimate basis to index
// (public uploads, via each platform's own public/official API, respecting
// their terms). Nothing here scrapes a page — every adapter goes through an
// official API endpoint.

export const WATCHED_MIXCLOUD_USERS: string[] = [
  // Well-known accounts that publish structured tracklists. Verified live
  // against mixcloud.com on 2026-09-25 — "nts-radio" and "defected" in the
  // original list were wrong handles (404 / no own uploads) and silently
  // contributed zero sets every run.
  // Edit freely — the ingestion job re-reads this list on every run.
  "NTSRadio", // ~89,751 shows
  "residentadvisor", // ~1,031 shows (RA podcast)
  "Defectedrecords", // ~898 shows (Defected Radio Show)
  "boomfestivalHQ", // ~127 shows (Boom Festival archive, dormant since ~2014 but real)
  "SBSR_FM", // Lux Frágil FM episodes (verified via user-submitted URL 2026-09-25)
];

export const YOUTUBE_SEARCH_QUERIES: string[] = [
  "DJ set tracklist",
  "boiler room tracklist",
];

export const YOUTUBE_CHANNEL_IDS: string[] = [];
