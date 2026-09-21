// Contract every source adapter implements. New sources (a new Mixcloud
// account, a new platform entirely) are added by writing one file that
// satisfies this interface and registering it — the pipeline, matching,
// storage and admin UI never need to change.

export type TimestampConfidence = "UNKNOWN" | "APPROXIMATE" | "EXACT";

export interface ParsedTrackEntry {
  position?: number;
  rawArtistText: string;
  rawTitleText: string;
  timestampSec?: number;
  timestampConfidence: TimestampConfidence;
  sourceNote?: string;
}

export interface DiscoveredSet {
  externalId: string;
  sourceUrl: string;
  title: string;
  djNames: string[]; // raw names exactly as the source presents them
  embedUrl?: string;
  thumbnailUrl?: string;
  description?: string;
  durationSec?: number;
  publishedAt?: Date;
  eventName?: string;
  eventYear?: number;
  eventType?:
    | "FESTIVAL"
    | "CLUB"
    | "RADIO_SHOW"
    | "STUDIO_MIX"
    | "LIVESTREAM"
    | "PODCAST"
    | "OTHER";
  rawPayload: unknown;
  /** true only for the sandbox demo/fixture adapter — never set by a real adapter. */
  isDemoFixture?: boolean;
}

export interface SourceAdapter {
  /** Matches source_platforms.adapter_key */
  adapterKey: string;
  /** Matches source_platforms.key */
  platformKey: string;
  platformName: string;
  baseUrl: string;
  supportsTimestampLinks: boolean;

  /** Step 1+2: find sets on the approved source that we don't have yet.
   * Implementations must themselves avoid returning obvious dupes where
   * cheaply possible, but the pipeline re-checks by (platform, externalId)
   * regardless. */
  discoverNew(limit: number): Promise<DiscoveredSet[]>;

  /** Used for user submissions and manual re-checks: resolve one URL directly. */
  fetchByUrl(url: string): Promise<DiscoveredSet | null>;

  /** Steps 3-6: given a discovered set (with its raw payload), extract and
   * normalize as much of the tracklist as the source legitimately exposes.
   * Must never invent an entry that isn't backed by source data. */
  parseTracklist(set: DiscoveredSet): Promise<ParsedTrackEntry[]>;

  /** Build a "play from here" URL/embed, if the platform supports it. */
  buildTimestampUrl(set: { sourceUrl: string; embedUrl?: string | null }, timestampSec: number): string | null;

  /** Whether this adapter is currently able to run (e.g. has required API keys). */
  isEnabled(): boolean;
  disabledReason?(): string | undefined;
}
