// Many uploaders paste a plain-text tracklist into a video/mix description,
// e.g.:
//   00:00 Larry Heard - Can You Feel It
//   04:12 - OMFO - Standby
//   [1:32:47] DJ Rino b2b - some ID
//   12. Floating Points - Silhouettes (16:03)
//
// This parser extracts (timestamp, artist, title) triples from free text.
// It is intentionally conservative: a line that doesn't look like
// "artist - title" is skipped rather than guessed at, and every entry keeps
// timestampConfidence so downstream code (and the UI) can tell an exact
// uploader-provided mark from an unknown one.

import type { ParsedTrackEntry } from "./types";

const TIME_TOKEN = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/; // [hh:]mm:ss

function timeTokenToSeconds(m: RegExpMatchArray): number {
  const [, h, mi, s] = m;
  const hours = h ? parseInt(h, 10) : 0;
  return hours * 3600 + parseInt(mi, 10) * 60 + parseInt(s, 10);
}

// Separators commonly used between artist and title.
const ARTIST_TITLE_SEP = /\s-\s|\s–\s|\s—\s/;

function splitArtistTitle(text: string): { artist: string; title: string } | null {
  const cleaned = text.trim();
  if (!cleaned || cleaned.length < 3) return null;
  const parts = cleaned.split(ARTIST_TITLE_SEP);
  if (parts.length < 2) return null;
  const artist = parts[0].trim();
  const title = parts.slice(1).join(" - ").trim();
  if (!artist || !title) return null;
  // Filter out lines that are clearly not track entries (URLs, hashtags, etc.)
  if (/^https?:\/\//i.test(artist) || artist.length > 80 || title.length > 140) return null;
  return { artist, title };
}

export function parseTimestampedText(text: string): ParsedTrackEntry[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const entries: ParsedTrackEntry[] = [];
  let position = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const timeMatch = line.match(TIME_TOKEN);
    if (!timeMatch) continue; // no timestamp on this line -> not a tracklist row we trust

    const timestampSec = timeTokenToSeconds(timeMatch);

    // Remove the timestamp token and surrounding brackets/numbering/noise,
    // then try to split what's left into artist/title.
    let rest = line
      .replace(timeMatch[0], "")
      .replace(/^[\s\-–—.:\[\]()]+/, "")
      .replace(/[\s\-–—.:\[\]()]+$/, "")
      .replace(/^\d+[.)]\s*/, "") // leading track numbers
      .trim();

    const split = splitArtistTitle(rest);
    if (!split) continue;

    position += 1;
    entries.push({
      position,
      rawArtistText: split.artist,
      rawTitleText: split.title,
      timestampSec,
      timestampConfidence: "EXACT",
    });
  }

  return entries;
}
