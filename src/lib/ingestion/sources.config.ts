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
  // Example, well-known accounts that publish structured tracklists.
  // Edit freely — the ingestion job re-reads this list on every run.
  "nts-radio",
  "residentadvisor",
  "defected",
];

export const YOUTUBE_SEARCH_QUERIES: string[] = [
  "DJ set tracklist",
  "boiler room tracklist",
];

export const YOUTUBE_CHANNEL_IDS: string[] = [];
