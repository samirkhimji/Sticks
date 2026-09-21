CREATE TYPE "public"."alias_source" AS ENUM('MUSICBRAINZ', 'INGESTION', 'MANUAL', 'USER_SUBMITTED');--> statement-breakpoint
CREATE TYPE "public"."artist_role" AS ENUM('PRIMARY', 'REMIXER', 'FEATURED', 'EDIT_BY');--> statement-breakpoint
CREATE TYPE "public"."click_type" AS ENUM('SET_RESULT', 'TIMESTAMP_PLAY', 'TRACK_LINK', 'ARTIST_LINK', 'RANDOM_SET');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('FESTIVAL', 'CLUB', 'RADIO_SHOW', 'STUDIO_MIX', 'LIVESTREAM', 'PODCAST', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('DISCOVERED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'PARTIAL', 'FAILED', 'NEEDS_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('AUTO_MATCHED', 'NEEDS_REVIEW', 'UNMATCHED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."review_item_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'MERGED');--> statement-breakpoint
CREATE TYPE "public"."review_item_type" AS ENUM('TRACK_MATCH', 'ARTIST_MATCH', 'DJ_MATCH', 'DUPLICATE_SET', 'FAILED_IMPORT');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('SCHEDULED', 'MANUAL', 'USER_SUBMISSION');--> statement-breakpoint
CREATE TYPE "public"."search_result_type" AS ENUM('TRACK', 'ARTIST', 'DJ', 'ZERO_RESULTS', 'MIXED');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('PENDING', 'VALIDATING', 'DUPLICATE', 'QUEUED', 'PROCESSED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."timestamp_confidence" AS ENUM('UNKNOWN', 'APPROXIMATE', 'EXACT');--> statement-breakpoint
CREATE TYPE "public"."tracklist_completeness" AS ENUM('UNKNOWN', 'NONE', 'PARTIAL', 'FULL');--> statement-breakpoint
CREATE TABLE "artist_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_id" text NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"source" "alias_source" NOT NULL,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"normalized_name" text NOT NULL,
	"disambiguation" text,
	"mbid" text,
	"country_code" text,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artists_slug_unique" UNIQUE("slug"),
	CONSTRAINT "artists_mbid_unique" UNIQUE("mbid")
);
--> statement-breakpoint
CREATE TABLE "click_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "click_type" NOT NULL,
	"target_id" text NOT NULL,
	"visitor_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dj_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"dj_id" text NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"source" "alias_source" NOT NULL,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dj_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"source_platform_id" text NOT NULL,
	"external_id" text NOT NULL,
	"source_url" text NOT NULL,
	"embed_url" text,
	"thumbnail_url" text,
	"description" text,
	"duration_sec" integer,
	"published_at" timestamp,
	"year_known" integer,
	"event_id" text,
	"import_status" "import_status" DEFAULT 'DISCOVERED' NOT NULL,
	"import_error" text,
	"tracklist_completeness" "tracklist_completeness" DEFAULT 'UNKNOWN' NOT NULL,
	"raw_payload" jsonb,
	"is_demo_fixture" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dj_sets_slug_unique" UNIQUE("slug"),
	CONSTRAINT "dj_sets_source_url_unique" UNIQUE("source_url")
);
--> statement-breakpoint
CREATE TABLE "djs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"normalized_name" text NOT NULL,
	"bio" text,
	"homepage_url" text,
	"image_url" text,
	"mbid" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "djs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "djs_mbid_unique" UNIQUE("mbid")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "event_type" DEFAULT 'OTHER' NOT NULL,
	"year" integer,
	"start_date" timestamp,
	"end_date" timestamp,
	"venue" text,
	"city" text,
	"country_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_platform_id" text NOT NULL,
	"status" "run_status" DEFAULT 'RUNNING' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"sets_discovered" integer DEFAULT 0 NOT NULL,
	"sets_created" integer DEFAULT 0 NOT NULL,
	"sets_updated" integer DEFAULT 0 NOT NULL,
	"sets_failed" integer DEFAULT 0 NOT NULL,
	"trigger" "run_trigger" DEFAULT 'SCHEDULED' NOT NULL,
	"error_log" text
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"visitor_id" text,
	"referrer" text,
	"is_organic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_queue_items" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "review_item_type" NOT NULL,
	"status" "review_item_status" DEFAULT 'PENDING' NOT NULL,
	"entity_id" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolution_note" text
);
--> statement-breakpoint
CREATE TABLE "search_events" (
	"id" text PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"normalized_query" text NOT NULL,
	"result_type" "search_result_type" NOT NULL,
	"result_count" integer NOT NULL,
	"visitor_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_djs" (
	"id" text PRIMARY KEY NOT NULL,
	"set_id" text NOT NULL,
	"dj_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_platforms" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text,
	"adapter_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"supports_timestamp_links" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "source_platforms_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "track_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"track_id" text NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"source" "alias_source" NOT NULL,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_appearances" (
	"id" text PRIMARY KEY NOT NULL,
	"set_id" text NOT NULL,
	"track_id" text,
	"position" integer,
	"raw_artist_text" text NOT NULL,
	"raw_title_text" text NOT NULL,
	"matched_artist_id" text,
	"timestamp_sec" integer,
	"timestamp_confidence" timestamp_confidence DEFAULT 'UNKNOWN' NOT NULL,
	"match_confidence" double precision DEFAULT 0 NOT NULL,
	"match_status" "match_status" DEFAULT 'UNMATCHED' NOT NULL,
	"source_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_artists" (
	"id" text PRIMARY KEY NOT NULL,
	"track_id" text NOT NULL,
	"artist_id" text NOT NULL,
	"role" "artist_role" DEFAULT 'PRIMARY' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"normalized_title" text NOT NULL,
	"isrc" text,
	"mbid" text,
	"duration_sec" integer,
	"release_year" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracks_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tracks_mbid_unique" UNIQUE("mbid")
);
--> statement-breakpoint
CREATE TABLE "user_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"status" "submission_status" DEFAULT 'PENDING' NOT NULL,
	"result_set_id" text,
	"rejection_reason" text,
	"submitter_ip_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" text PRIMARY KEY NOT NULL,
	"first_seen" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"visit_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artist_aliases" ADD CONSTRAINT "artist_aliases_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dj_aliases" ADD CONSTRAINT "dj_aliases_dj_id_djs_id_fk" FOREIGN KEY ("dj_id") REFERENCES "public"."djs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dj_sets" ADD CONSTRAINT "dj_sets_source_platform_id_source_platforms_id_fk" FOREIGN KEY ("source_platform_id") REFERENCES "public"."source_platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dj_sets" ADD CONSTRAINT "dj_sets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_platform_id_source_platforms_id_fk" FOREIGN KEY ("source_platform_id") REFERENCES "public"."source_platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_djs" ADD CONSTRAINT "set_djs_set_id_dj_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."dj_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_djs" ADD CONSTRAINT "set_djs_dj_id_djs_id_fk" FOREIGN KEY ("dj_id") REFERENCES "public"."djs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_aliases" ADD CONSTRAINT "track_aliases_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_appearances" ADD CONSTRAINT "track_appearances_set_id_dj_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."dj_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_appearances" ADD CONSTRAINT "track_appearances_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_appearances" ADD CONSTRAINT "track_appearances_matched_artist_id_artists_id_fk" FOREIGN KEY ("matched_artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artist_aliases_artist_norm_uq" ON "artist_aliases" USING btree ("artist_id","normalized_alias");--> statement-breakpoint
CREATE INDEX "artist_aliases_norm_idx" ON "artist_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "artists_normalized_name_idx" ON "artists" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "click_events_type_created_idx" ON "click_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dj_aliases_dj_norm_uq" ON "dj_aliases" USING btree ("dj_id","normalized_alias");--> statement-breakpoint
CREATE INDEX "dj_aliases_norm_idx" ON "dj_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE UNIQUE INDEX "dj_sets_platform_external_uq" ON "dj_sets" USING btree ("source_platform_id","external_id");--> statement-breakpoint
CREATE INDEX "dj_sets_import_status_idx" ON "dj_sets" USING btree ("import_status");--> statement-breakpoint
CREATE INDEX "dj_sets_event_idx" ON "dj_sets" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "djs_normalized_name_idx" ON "djs" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "ingestion_runs_platform_started_idx" ON "ingestion_runs" USING btree ("source_platform_id","started_at");--> statement-breakpoint
CREATE INDEX "page_views_created_idx" ON "page_views" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "page_views_path_created_idx" ON "page_views" USING btree ("path","created_at");--> statement-breakpoint
CREATE INDEX "review_queue_status_type_idx" ON "review_queue_items" USING btree ("status","type");--> statement-breakpoint
CREATE INDEX "search_events_created_idx" ON "search_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "search_events_type_created_idx" ON "search_events" USING btree ("result_type","created_at");--> statement-breakpoint
CREATE INDEX "search_events_norm_query_idx" ON "search_events" USING btree ("normalized_query");--> statement-breakpoint
CREATE UNIQUE INDEX "set_djs_uq" ON "set_djs" USING btree ("set_id","dj_id");--> statement-breakpoint
CREATE INDEX "set_djs_dj_idx" ON "set_djs" USING btree ("dj_id");--> statement-breakpoint
CREATE UNIQUE INDEX "track_aliases_track_norm_uq" ON "track_aliases" USING btree ("track_id","normalized_alias");--> statement-breakpoint
CREATE INDEX "track_aliases_norm_idx" ON "track_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "track_appearances_set_idx" ON "track_appearances" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "track_appearances_track_idx" ON "track_appearances" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "track_appearances_status_idx" ON "track_appearances" USING btree ("match_status");--> statement-breakpoint
CREATE UNIQUE INDEX "track_artists_uq" ON "track_artists" USING btree ("track_id","artist_id","role");--> statement-breakpoint
CREATE INDEX "track_artists_artist_idx" ON "track_artists" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "tracks_normalized_title_idx" ON "tracks" USING btree ("normalized_title");--> statement-breakpoint
CREATE INDEX "user_submissions_status_idx" ON "user_submissions" USING btree ("status");