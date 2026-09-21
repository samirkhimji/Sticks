// Ranking for "this track appears in these sets" results.
//
// Deliberately NOT "sort by DJ follower count" or "sort by platform" — that
// would let famous DJs and big platforms dominate every result page. Instead
// we score each appearance on things that make it a *useful, playable*
// result, then run a diversity pass so the default ~12-result page doesn't
// show the same DJ or event five times even if their sets scored highest.

import type { AppearanceRow } from "./appearances";

export type ResultFilter = "top" | "recent" | "long" | "festival" | "radio";

const WEIGHTS = {
  matchConfidence: 0.32,
  timestamp: 0.24,
  completeness: 0.16,
  recency: 0.13,
  engagement: 0.15,
};

function timestampScore(row: AppearanceRow): number {
  if (row.timestampSec == null) return 0;
  if (row.timestampConfidence === "EXACT") return 1;
  if (row.timestampConfidence === "APPROXIMATE") return 0.6;
  return 0.2;
}

function completenessScore(row: AppearanceRow): number {
  switch (row.tracklistCompleteness) {
    case "FULL":
      return 1;
    case "PARTIAL":
      return 0.5;
    default:
      return 0.1;
  }
}

function recencyScore(row: AppearanceRow): number {
  const date = row.publishedAt ?? (row.yearKnown ? new Date(row.yearKnown, 0, 1) : null);
  if (!date) return 0.3; // unknown date: don't penalize hard, just stay neutral-low
  const ageYears = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
  return 1 / (1 + Math.max(0, ageYears) / 4);
}

function engagementScore(row: AppearanceRow, maxEngagement: number): number {
  if (maxEngagement <= 0) return 0; // no signal yet — contribute nothing, don't fake it
  const raw = row.viewCount + row.clickCount * 3; // clicks are a stronger signal than views
  return Math.log(1 + raw) / Math.log(1 + maxEngagement);
}

export interface ScoredAppearance extends AppearanceRow {
  score: number;
}

export function scoreAppearances(rows: AppearanceRow[]): ScoredAppearance[] {
  const maxEngagement = Math.max(0, ...rows.map((r) => r.viewCount + r.clickCount * 3));
  return rows.map((row) => ({
    ...row,
    score:
      WEIGHTS.matchConfidence * row.matchConfidence +
      WEIGHTS.timestamp * timestampScore(row) +
      WEIGHTS.completeness * completenessScore(row) +
      WEIGHTS.recency * recencyScore(row) +
      WEIGHTS.engagement * engagementScore(row, maxEngagement),
  }));
}

export function applyFilter(rows: ScoredAppearance[], filter: ResultFilter): ScoredAppearance[] {
  switch (filter) {
    case "recent":
      return [...rows].sort((a, b) => {
        const ad = a.publishedAt?.getTime() ?? (a.yearKnown ? new Date(a.yearKnown, 0, 1).getTime() : 0);
        const bd = b.publishedAt?.getTime() ?? (b.yearKnown ? new Date(b.yearKnown, 0, 1).getTime() : 0);
        return bd - ad;
      });
    case "long":
      return rows
        .filter((r) => (r.durationSec ?? 0) >= 45 * 60)
        .sort((a, b) => (b.durationSec ?? 0) - (a.durationSec ?? 0));
    case "festival":
      return rows.filter((r) => r.eventType === "FESTIVAL").sort((a, b) => b.score - a.score);
    case "radio":
      return rows
        .filter((r) => r.eventType === "RADIO_SHOW" || r.eventType === "STUDIO_MIX" || r.eventType === "PODCAST")
        .sort((a, b) => b.score - a.score);
    case "top":
    default:
      return [...rows].sort((a, b) => b.score - a.score);
  }
}

/** Greedy diversity pass: walk the score-sorted list, but soft-cap how many
 * results from the same DJ / event / source platform can land in the initial
 * page, so one prolific DJ or one dominant platform can't fill the whole
 * "top matches" slice. Skipped items are appended afterwards in score order,
 * so nothing is lost — "Explore all" still shows everything. */
export function diversify(sorted: ScoredAppearance[], pageSize: number): ScoredAppearance[] {
  const CAP_PER_DJ = 2;
  const CAP_PER_EVENT = 2;
  const CAP_PER_PLATFORM = Math.max(3, Math.ceil(pageSize / 3));

  const djCounts = new Map<string, number>();
  const eventCounts = new Map<string, number>();
  const platformCounts = new Map<string, number>();

  const picked: ScoredAppearance[] = [];
  const deferred: ScoredAppearance[] = [];

  for (const row of sorted) {
    if (picked.length >= pageSize) {
      deferred.push(row);
      continue;
    }
    const djKey = row.djs.map((d) => d.id).sort().join(",") || "unknown";
    const eventKey = row.eventId ?? "none";
    const platformKey = row.sourcePlatformKey;

    const djOk = (djCounts.get(djKey) ?? 0) < CAP_PER_DJ;
    const eventOk = eventKey === "none" || (eventCounts.get(eventKey) ?? 0) < CAP_PER_EVENT;
    const platformOk = (platformCounts.get(platformKey) ?? 0) < CAP_PER_PLATFORM;

    if (djOk && eventOk && platformOk) {
      picked.push(row);
      djCounts.set(djKey, (djCounts.get(djKey) ?? 0) + 1);
      eventCounts.set(eventKey, (eventCounts.get(eventKey) ?? 0) + 1);
      platformCounts.set(platformKey, (platformCounts.get(platformKey) ?? 0) + 1);
    } else {
      deferred.push(row);
    }
  }

  // Backfill remaining slots (caps relaxed) if diversity constraints left the
  // page short — being useful beats being perfectly diverse.
  for (const row of deferred) {
    if (picked.length >= pageSize) break;
    if (!picked.includes(row)) picked.push(row);
  }

  return picked;
}

/** Weighted random pick, biased toward higher-scored (more useful/playable)
 * results, for the "Give me a set" / "Random set" feature. */
export function weightedRandomPick(rows: ScoredAppearance[]): ScoredAppearance | null {
  if (rows.length === 0) return null;
  const weights = rows.map((r) => Math.max(0.05, r.score));
  const total = weights.reduce((a, b) => a + b, 0);
  let target = Math.random() * total;
  for (let i = 0; i < rows.length; i++) {
    target -= weights[i];
    if (target <= 0) return rows[i];
  }
  return rows[rows.length - 1];
}
