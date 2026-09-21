// Text normalization used consistently everywhere a name/title is stored or
// compared: artists, tracks, DJs, aliases, and incoming search queries all
// go through this so "OMFO", "O.M.F.O.", "  omfo  " and "Omfo!" converge on
// the same normalized key for exact lookups, before any fuzzy matching runs.

/**
 * Lowercase, strip diacritics, drop punctuation, collapse whitespace.
 * Deliberately conservative: it does not remove words like "the" or "dj"
 * because doing so can merge genuinely different names.
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ") // drop punctuation/symbols
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A looser key for artist-name matching that also strips spacing between
 * single letters, so "O.M.F.O." / "O M F O" / "OMFO" all collapse to "omfo".
 * Used only as a *secondary* lookup key, never for track titles (too
 * aggressive there — would merge unrelated short titles).
 */
export function normalizeAcronym(input: string): string {
  const base = normalizeText(input);
  const collapsedSingleLetters = base
    .split(" ")
    .every((tok) => tok.length === 1)
    ? base.replace(/\s+/g, "")
    : base;
  return collapsedSingleLetters;
}

/** Strip common noise suffixes from track titles before comparing them:
 * "(Original Mix)", "[Radio Edit]", "- Remastered 2020", feat./ft. clauses.
 * We keep the *canonical* title without these, but the raw text is always
 * preserved separately on the TrackAppearance row.
 */
const NOISE_PATTERNS: RegExp[] = [
  /\(([^)]*\b(original mix|radio edit|extended mix|club mix|album version|remastered[^)]*|edit|mix)\b[^)]*)\)/gi,
  /\[([^\]]*\b(original mix|radio edit|extended mix|club mix|remastered[^\]]*|edit|mix)\b[^\]]*)\]/gi,
  /\s-\s*remaster(ed)?\s*\d{0,4}$/i,
];

export function stripTitleNoise(title: string): string {
  let out = title;
  for (const re of NOISE_PATTERNS) out = out.replace(re, "");
  return out.replace(/\s+/g, " ").trim();
}

/** URL-safe slug from a display name, with a short random suffix to avoid
 * collisions when two different entities normalize to the same slug base. */
export function slugify(input: string): string {
  return normalizeText(input).trim().replace(/\s+/g, "-").slice(0, 80) || "item";
}

/** Levenshtein edit distance — used as a secondary confidence signal
 * alongside Postgres trigram similarity (which is computed in SQL). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  let prevRow = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prevRow[j] = j;

  for (let i = 1; i <= al; i++) {
    const currRow = new Array(bl + 1);
    currRow[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1, // insertion
        prevRow[j] + 1, // deletion
        prevRow[j - 1] + cost // substitution
      );
    }
    prevRow = currRow;
  }
  return prevRow[bl];
}

/** 0..1 similarity derived from edit distance, normalized by longer string length. */
export function levenshteinSimilarity(a: string, b: string): number {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}
