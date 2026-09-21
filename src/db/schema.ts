// ============================================================================
// DIGGR — data model (Drizzle ORM / PostgreSQL)
//
// Design principles:
// - Every fact about "a track playing inside a set" is a first-class row
//   (trackAppearances), linked to canonical artist/track/dj entities — never
//   free text alone. A track appearing in 100 sets is one Track row joined
//   to 100 TrackAppearance rows.
// - Every entity that can have multiple spellings (artist, track, dj) has an
//   alias table so "OMFO" / "O.M.F.O." / "Our Man From Odessa" resolve to one
//   canonical row.
// - Every imported fact carries provenance: which source platform, which URL,
//   the raw payload, when it was fetched, and a confidence score. Nothing is
//   silently invented — uncertain matches sit in a review queue instead of
//   being merged automatically.
// ============================================================================

import { createId } from "@paralleldrive/cuid2";
import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => createId());

// ----------------------------------------------------------------------------
// Enums
// ----------------------------------------------------------------------------

export const artistRoleEnum = pgEnum("artist_role", [
  "PRIMARY",
  "REMIXER",
  "FEATURED",
  "EDIT_BY",
]);

export const aliasSourceEnum = pgEnum("alias_source", [
  "MUSICBRAINZ",
  "INGESTION",
  "MANUAL",
  "USER_SUBMITTED",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "FESTIVAL",
  "CLUB",
  "RADIO_SHOW",
  "STUDIO_MIX",
  "LIVESTREAM",
  "PODCAST",
  "OTHER",
]);

export const runStatusEnum = pgEnum("run_status", [
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "PARTIAL",
]);

export const runTriggerEnum = pgEnum("run_trigger", [
  "SCHEDULED",
  "MANUAL",
  "USER_SUBMISSION",
]);

export const importStatusEnum = pgEnum("import_status", [
  "DISCOVERED",
  "QUEUED",
  "PROCESSING",
  "PROCESSED",
  "PARTIAL",
  "FAILED",
  "NEEDS_REVIEW",
]);

export const tracklistCompletenessEnum = pgEnum("tracklist_completeness", [
  "UNKNOWN",
  "NONE",
  "PARTIAL",
  "FULL",
]);

export const timestampConfidenceEnum = pgEnum("timestamp_confidence", [
  "UNKNOWN",
  "APPROXIMATE",
  "EXACT",
]);

export const matchStatusEnum = pgEnum("match_status", [
  "AUTO_MATCHED",
  "NEEDS_REVIEW",
  "UNMATCHED",
  "REJECTED",
]);

export const reviewItemTypeEnum = pgEnum("review_item_type", [
  "TRACK_MATCH",
  "ARTIST_MATCH",
  "DJ_MATCH",
  "DUPLICATE_SET",
  "FAILED_IMPORT",
]);

export const reviewItemStatusEnum = pgEnum("review_item_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "MERGED",
]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "PENDING",
  "VALIDATING",
  "DUPLICATE",
  "QUEUED",
  "PROCESSED",
  "REJECTED",
]);

export const searchResultTypeEnum = pgEnum("search_result_type", [
  "TRACK",
  "ARTIST",
  "DJ",
  "ZERO_RESULTS",
  "MIXED",
]);

export const clickTypeEnum = pgEnum("click_type", [
  "SET_RESULT",
  "TIMESTAMP_PLAY",
  "TRACK_LINK",
  "ARTIST_LINK",
  "RANDOM_SET",
]);

// ----------------------------------------------------------------------------
// Core music entities
// ----------------------------------------------------------------------------

export const artists = pgTable(
  "artists",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    normalizedName: text("normalized_name").notNull(),
    disambiguation: text("disambiguation"),
    mbid: text("mbid").unique(),
    countryCode: text("country_code"),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("artists_normalized_name_idx").on(t.normalizedName)]
);

export const artistAliases = pgTable(
  "artist_aliases",
  {
    id: id(),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    source: aliasSourceEnum("source").notNull(),
    confidence: doublePrecision("confidence").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("artist_aliases_artist_norm_uq").on(t.artistId, t.normalizedAlias),
    index("artist_aliases_norm_idx").on(t.normalizedAlias),
  ]
);

export const tracks = pgTable(
  "tracks",
  {
    id: id(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    normalizedTitle: text("normalized_title").notNull(),
    isrc: text("isrc"),
    mbid: text("mbid").unique(),
    durationSec: integer("duration_sec"),
    releaseYear: integer("release_year"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("tracks_normalized_title_idx").on(t.normalizedTitle)]
);

export const trackAliases = pgTable(
  "track_aliases",
  {
    id: id(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    source: aliasSourceEnum("source").notNull(),
    confidence: doublePrecision("confidence").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("track_aliases_track_norm_uq").on(t.trackId, t.normalizedAlias),
    index("track_aliases_norm_idx").on(t.normalizedAlias),
  ]
);

export const trackArtists = pgTable(
  "track_artists",
  {
    id: id(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    role: artistRoleEnum("role").notNull().default("PRIMARY"),
  },
  (t) => [
    uniqueIndex("track_artists_uq").on(t.trackId, t.artistId, t.role),
    index("track_artists_artist_idx").on(t.artistId),
  ]
);

// ----------------------------------------------------------------------------
// DJs, Events
// ----------------------------------------------------------------------------

export const djs = pgTable(
  "djs",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    normalizedName: text("normalized_name").notNull(),
    bio: text("bio"),
    homepageUrl: text("homepage_url"),
    imageUrl: text("image_url"),
    mbid: text("mbid").unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("djs_normalized_name_idx").on(t.normalizedName)]
);

export const djAliases = pgTable(
  "dj_aliases",
  {
    id: id(),
    djId: text("dj_id")
      .notNull()
      .references(() => djs.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    source: aliasSourceEnum("source").notNull(),
    confidence: doublePrecision("confidence").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dj_aliases_dj_norm_uq").on(t.djId, t.normalizedAlias),
    index("dj_aliases_norm_idx").on(t.normalizedAlias),
  ]
);

export const events = pgTable("events", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: eventTypeEnum("type").notNull().default("OTHER"),
  year: integer("year"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  venue: text("venue"),
  city: text("city"),
  countryCode: text("country_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ----------------------------------------------------------------------------
// Sources / provenance
// ----------------------------------------------------------------------------

export const sourcePlatforms = pgTable("source_platforms", {
  id: id(),
  key: text("key").notNull().unique(), // "mixcloud" | "youtube" | "manual" | "demo_fixture"
  name: text("name").notNull(),
  baseUrl: text("base_url"),
  adapterKey: text("adapter_key").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  supportsTimestampLinks: boolean("supports_timestamp_links").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: id(),
    sourcePlatformId: text("source_platform_id")
      .notNull()
      .references(() => sourcePlatforms.id, { onDelete: "cascade" }),
    status: runStatusEnum("status").notNull().default("RUNNING"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
    setsDiscovered: integer("sets_discovered").notNull().default(0),
    setsCreated: integer("sets_created").notNull().default(0),
    setsUpdated: integer("sets_updated").notNull().default(0),
    setsFailed: integer("sets_failed").notNull().default(0),
    trigger: runTriggerEnum("trigger").notNull().default("SCHEDULED"),
    errorLog: text("error_log"),
  },
  (t) => [index("ingestion_runs_platform_started_idx").on(t.sourcePlatformId, t.startedAt)]
);

// ----------------------------------------------------------------------------
// DJ Sets and track appearances
// ----------------------------------------------------------------------------

export const djSets = pgTable(
  "dj_sets",
  {
    id: id(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    sourcePlatformId: text("source_platform_id")
      .notNull()
      .references(() => sourcePlatforms.id),
    externalId: text("external_id").notNull(),
    sourceUrl: text("source_url").notNull().unique(),
    embedUrl: text("embed_url"),
    thumbnailUrl: text("thumbnail_url"),
    description: text("description"),
    durationSec: integer("duration_sec"),
    publishedAt: timestamp("published_at"),
    yearKnown: integer("year_known"),
    eventId: text("event_id").references(() => events.id),

    importStatus: importStatusEnum("import_status").notNull().default("DISCOVERED"),
    importError: text("import_error"),
    tracklistCompleteness: tracklistCompletenessEnum("tracklist_completeness")
      .notNull()
      .default("UNKNOWN"),
    rawPayload: jsonb("raw_payload"),
    isDemoFixture: boolean("is_demo_fixture").notNull().default(false),

    viewCount: integer("view_count").notNull().default(0),
    clickCount: integer("click_count").notNull().default(0),

    lastCheckedAt: timestamp("last_checked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dj_sets_platform_external_uq").on(t.sourcePlatformId, t.externalId),
    index("dj_sets_import_status_idx").on(t.importStatus),
    index("dj_sets_event_idx").on(t.eventId),
  ]
);

export const setDjs = pgTable(
  "set_djs",
  {
    id: id(),
    setId: text("set_id")
      .notNull()
      .references(() => djSets.id, { onDelete: "cascade" }),
    djId: text("dj_id")
      .notNull()
      .references(() => djs.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("set_djs_uq").on(t.setId, t.djId),
    index("set_djs_dj_idx").on(t.djId),
  ]
);

export const trackAppearances = pgTable(
  "track_appearances",
  {
    id: id(),
    setId: text("set_id")
      .notNull()
      .references(() => djSets.id, { onDelete: "cascade" }),
    trackId: text("track_id").references(() => tracks.id),

    position: integer("position"),
    rawArtistText: text("raw_artist_text").notNull(),
    rawTitleText: text("raw_title_text").notNull(),
    matchedArtistId: text("matched_artist_id").references(() => artists.id),

    timestampSec: integer("timestamp_sec"),
    timestampConfidence: timestampConfidenceEnum("timestamp_confidence")
      .notNull()
      .default("UNKNOWN"),

    matchConfidence: doublePrecision("match_confidence").notNull().default(0),
    matchStatus: matchStatusEnum("match_status").notNull().default("UNMATCHED"),
    sourceNote: text("source_note"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("track_appearances_set_idx").on(t.setId),
    index("track_appearances_track_idx").on(t.trackId),
    index("track_appearances_status_idx").on(t.matchStatus),
  ]
);

// ----------------------------------------------------------------------------
// Review queue
// ----------------------------------------------------------------------------

export const reviewQueueItems = pgTable(
  "review_queue_items",
  {
    id: id(),
    type: reviewItemTypeEnum("type").notNull(),
    status: reviewItemStatusEnum("status").notNull().default("PENDING"),
    entityId: text("entity_id").notNull(),
    details: jsonb("details").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
    resolutionNote: text("resolution_note"),
  },
  (t) => [index("review_queue_status_type_idx").on(t.status, t.type)]
);

// ----------------------------------------------------------------------------
// User submissions
// ----------------------------------------------------------------------------

export const userSubmissions = pgTable(
  "user_submissions",
  {
    id: id(),
    url: text("url").notNull(),
    status: submissionStatusEnum("status").notNull().default("PENDING"),
    resultSetId: text("result_set_id"),
    rejectionReason: text("rejection_reason"),
    submitterIpHash: text("submitter_ip_hash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
  },
  (t) => [index("user_submissions_status_idx").on(t.status)]
);

// ----------------------------------------------------------------------------
// Analytics (first-party, privacy-conscious)
// ----------------------------------------------------------------------------

export const searchEvents = pgTable(
  "search_events",
  {
    id: id(),
    query: text("query").notNull(),
    normalizedQuery: text("normalized_query").notNull(),
    resultType: searchResultTypeEnum("result_type").notNull(),
    resultCount: integer("result_count").notNull(),
    visitorId: text("visitor_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("search_events_created_idx").on(t.createdAt),
    index("search_events_type_created_idx").on(t.resultType, t.createdAt),
    index("search_events_norm_query_idx").on(t.normalizedQuery),
  ]
);

export const clickEvents = pgTable(
  "click_events",
  {
    id: id(),
    type: clickTypeEnum("type").notNull(),
    targetId: text("target_id").notNull(),
    visitorId: text("visitor_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("click_events_type_created_idx").on(t.type, t.createdAt)]
);

export const pageViews = pgTable(
  "page_views",
  {
    id: id(),
    path: text("path").notNull(),
    visitorId: text("visitor_id"),
    referrer: text("referrer"),
    isOrganic: boolean("is_organic").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("page_views_created_idx").on(t.createdAt),
    index("page_views_path_created_idx").on(t.path, t.createdAt),
  ]
);

export const visitors = pgTable("visitors", {
  id: id(),
  firstSeen: timestamp("first_seen").notNull().defaultNow(),
  lastSeen: timestamp("last_seen").notNull().defaultNow(),
  visitCount: integer("visit_count").notNull().default(1),
});
