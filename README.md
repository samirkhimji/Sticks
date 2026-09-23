# Sticks — find DJ sets by the track inside them

A search engine for DJ sets, organized around **track/artist → sets that play it**,
not the conventional **set → tracklist**. Search a track or artist, get back the
DJ sets that contain it with a timestamp and a "play from here" link where the
source platform supports it.

This is a working MVP: real database, real search/ranking, a real ingestion
pipeline against a real (keyless) source API, a review queue for uncertain
matches, an admin dashboard, a public submission flow, and SEO plumbing
(sitemap, structured data, clean URLs). It is built to keep growing on its own
via scheduled ingestion, without manual data entry.

## Important: read this before judging the seed data

**This was built inside a sandboxed environment with no outbound internet
access to Mixcloud, MusicBrainz, or any other external API** — only package
registries (npm, pip) and GitHub were reachable. That meant the ingestion
adapters could be written and unit-tested against the real, documented APIs,
but not exercised against live data from inside that sandbox.

To still prove the full pipeline works end to end, `scripts/seed.ts` runs the
**exact same parsing/normalization/matching code** (`lib/ingestion/pipeline.ts`,
`lib/normalize/resolve.ts`) against local JSON fixtures shaped exactly like
real Mixcloud API responses (`lib/ingestion/fixtures/mixcloud/*.json`), instead
of fetching them over HTTP. Every set produced this way is flagged
`isDemoFixture: true` in the database and labeled "demo fixture — unverified"
everywhere it appears in the UI — it is never presented as confirmed real
content. The one deliberate exception is intentional: the fixture set
"DJ Rino — Floresta, Waking Life 2024" containing "OMFO — Standby" at
1:32:47 is included specifically to demonstrate the acceptance test from the
spec, using the artist/track/DJ/event names given in the brief — it is not a
claim that this specific recording and timestamp are independently verified.

**Once deployed anywhere with normal internet access** (Vercel, Railway, a
VPS — anything), run the real ingestion adapters (`mixcloud`, and `youtube`
once you add an API key) via the admin panel's "Run now" or the scheduled
cron job, and the catalog fills in with genuinely live, verified data. Nothing
about the architecture is sandbox-specific; only the demo seed step is.

## Quickstart

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL etc.
npm run db:generate            # generate SQL migrations from schema.ts (already committed, only needed if you change the schema)
npm run db:migrate             # apply migrations
psql "$DATABASE_URL" -f scripts/sql/post-migrate.sql   # pg_trgm + indexes, one-time
npm run seed                   # demo fixture data — see disclosure above
npm run dev
```

Visit `http://localhost:3000` and search **"OMFO"** or **"Our Man From Odessa"**.

Admin dashboard: `http://localhost:3000/admin` (password = `ADMIN_PASSWORD` in `.env`).

## Architecture

**Stack:** Next.js (App Router, TypeScript) for both the public site and the
admin panel, one Postgres database, Drizzle ORM. No separate backend service,
no queue infrastructure, no serverless functions beyond what Next.js route
handlers already give you. This is deliberate — the brief asks for "avoid
unnecessary infrastructure and premature scaling," and a single Postgres-backed
Next.js app is enough to run search, ingestion, admin, and SEO for a very long
time before anything more elaborate is justified.

**Why Drizzle instead of Prisma:** Prisma's CLI downloads a native query-engine
binary from `binaries.prisma.sh` at install/generate time. That host is
unreachable from this build sandbox (and might be blocked by some
organizations' egress policies in production too), so migrations would
silently fail in more places than just here. Drizzle is pure TypeScript, talks
to Postgres directly via `pg`, and needed zero special-casing. It's also a
lighter dependency for a project this size.

**Why Postgres:** `pg_trgm` gives free, fast fuzzy/typo-tolerant text matching
(trigram similarity) directly in the database — exactly what "tolerate
imperfect queries... minor spelling differences" needs — without standing up
a separate search service (Elasticsearch/Algolia/etc.) for an MVP-scale
catalog. `pg_trgm` + a couple of GIN indexes comfortably handles hundreds of
thousands of rows; if the catalog outgrows that, the search layer
(`lib/search/query.ts`) is isolated enough to swap in a dedicated search
engine later without touching ingestion or the data model.

**Why no separate job queue:** ingestion runs are triggered by an HTTP
endpoint (`/api/cron/ingest`) called on a schedule (Vercel Cron or GitHub
Actions — both configured, pick one), or manually from the admin panel. Each
run processes a bounded batch and writes an `ingestion_runs` row. That's
sufficient at this scale and avoids running Redis/SQS/etc. for an MVP. If
volume grows enough to need retries/backoff/parallelism, the adapter
interface (`lib/ingestion/types.ts`) is queue-agnostic and would drop into a
real job runner without changes to the adapters themselves.

### Data model (`src/db/schema.ts`)

Modeled so that **a track appearing in 100 sets is one canonical `tracks` row
joined to 100 `track_appearances` rows** — never duplicated free text.

- `artists`, `tracks`, `djs`, `events` — canonical entities.
- `artist_aliases`, `track_aliases`, `dj_aliases` — alternate spellings/names,
  each with a `source` (`MUSICBRAINZ` / `INGESTION` / `MANUAL` /
  `USER_SUBMITTED`) and a `confidence`. This is how "OMFO" / "O.M.F.O." /
  "Our Man From Odessa" converge on one artist.
- `track_artists` — many-to-many (a track can have multiple artists: remixer,
  featured, etc.).
- `source_platforms` — one row per adapter (Mixcloud, YouTube, ...).
- `dj_sets` — one row per indexed set, with `source_url` + `external_id`
  (unique together — the dedup key), `raw_payload` (the original API
  response, kept for auditability/reprocessing), `import_status`,
  `tracklist_completeness`, and `is_demo_fixture`.
- `track_appearances` — the core fact: which track, in which set, at which
  timestamp, with what confidence and match status
  (`AUTO_MATCHED` / `NEEDS_REVIEW` / `UNMATCHED` / `REJECTED`). Raw text is
  always preserved (`raw_artist_text`, `raw_title_text`) even after matching.
- `review_queue_items` — anything ingestion wasn't confident enough to apply
  automatically, with the candidate match and score attached.
- `user_submissions`, `ingestion_runs` — provenance/audit trail for both
  growth paths (scheduled discovery and manual submission).
- `search_events`, `click_events`, `page_views`, `visitors` — first-party
  analytics (see below).

### Normalization & matching (`src/lib/normalize/`)

1. **Text normalization** (`text.ts`): lowercase, strip diacritics/punctuation,
   collapse whitespace — used consistently for every stored name/title so
   exact lookups work first.
2. **Exact match** on canonical name or a known alias → confidence 1.0,
   applied immediately.
3. **Fuzzy match** via Postgres trigram similarity (`resolve.ts`) against
   existing artists/tracks/DJs and their aliases:
   - score ≥ **0.86** → auto-accept, and the raw text is saved as a new alias
     (source `INGESTION`) so the next exact match is instant.
   - **0.55–0.86** → too uncertain to merge automatically. A
     `review_queue_items` row is created with the candidate and score; the
     appearance is stored with `matchStatus = NEEDS_REVIEW` and no track/artist
     link yet, never guessed at.
   - < 0.55 → treated as genuinely new data; a new canonical row is created.
     This is how the catalog grows without manual entry.
4. **MusicBrainz enrichment** (`musicbrainz.ts`): a real client against
   MusicBrainz's free, keyless JSON API, used to fetch a canonical MBID and
   — critically — **alias data that no string-similarity metric could ever
   find** (e.g. "OMFO" and "Our Man From Odessa" share no characters). It's
   called best-effort after creating a new artist and fails silently if
   unreachable (as it is in this sandbox) — normalization proceeds without it
   rather than blocking. In this sandbox, the "Our Man From Odessa" alias for
   OMFO is instead seeded by hand in `scripts/seed.ts` as a `MANUAL` alias,
   standing in for what MusicBrainz would supply automatically once the app
   has real internet access.
5. **Admin review queue** (`/admin/review`): a human approves (confirms the
   candidate match) or rejects (confirms it's a distinct new entity, which
   creates one via `forceCreateArtist`/`forceCreateTrack`/`forceCreateDj` —
   bypassing fuzzy matching so it doesn't just re-find the same rejected
   candidate).

### Ingestion (`src/lib/ingestion/`)

Every source is an adapter implementing one interface (`types.ts`):
`discoverNew()`, `fetchByUrl()`, `parseTracklist()`, `buildTimestampUrl()`,
`isEnabled()`. The pipeline (`pipeline.ts`) is adapter-agnostic: dedup by
`(source_platform, external_id)`, resolve DJ(s)/event/tracklist entries
through the normalization layer, record provenance, and never let one bad set
fail the whole run.

- **`adapters/mixcloud.ts`** — the real, primary V1 source. Mixcloud's public
  API is keyless for reading public cloudcasts and — the key reason it was
  chosen — supports a structured `sections` field (`{artist, song,
  start_time}`) that uploaders can attach as a real tracklist with real
  timestamps. No scraping, no ToS issue: it's their documented API. Falls
  back to parsing a plain-text timestamped tracklist from the description
  when `sections` isn't present (very common on Mixcloud).
- **`adapters/youtube.ts`** — fully implemented against the real YouTube Data
  API v3, but disabled until you set `YOUTUBE_API_KEY` (none was available
  for this build). `isEnabled()`/`disabledReason()` make this visible in the
  admin panel rather than failing silently.
- **`adapters/demoFixture.ts`** — sandbox-only. Reads local fixture JSON and
  runs it through the Mixcloud adapter's own `parseCloudcastPayload()` — the
  identical parsing function the live adapter uses. See the disclosure above.
- **`parseTimestampedText.ts`** — shared parser for "00:00 Artist - Title"
  style tracklists in descriptions, used by both Mixcloud (fallback) and
  YouTube.
- **`sources.config.ts`** — the list of watched Mixcloud accounts / YouTube
  search queries. This is the file you edit to grow coverage; no code changes
  needed to add a new account.

**Adding a new source later:** write one file implementing `SourceAdapter`,
add it to `registry.ts`, done. The pipeline, database, admin UI, and search
never need to change. Audio fingerprinting (explicitly out of scope for V1)
would slot in the same way — as another adapter whose `parseTracklist()`
happens to call an audio-ID service instead of reading an API field.

**Scheduling:** `/api/cron/ingest` (protected by `CRON_SECRET` as a bearer
token) runs every enabled non-demo adapter. Wired up two ways — use whichever
fits your deploy target:
- `vercel.json` — Vercel Cron, every 6 hours. Set `CRON_SECRET` as an env var
  on the Vercel project and Vercel sends it automatically as
  `Authorization: Bearer <value>`.
- `.github/workflows/ingest.yml` — GitHub Actions on a schedule, for finer
  control or a non-Vercel deploy. Needs `SITE_URL` and `CRON_SECRET` repo
  secrets.

### Search & ranking (`src/lib/search/`)

- **`query.ts`** — the homepage search box. Tries exact match (including an
  acronym-collapsing form for things like "O.M.F.O." → "omfo") before falling
  back to trigram fuzzy search across tracks, artists, DJs, and their
  aliases. A confident single match redirects straight to that entity's page;
  otherwise a disambiguation list is shown.
- **`rank.ts`** — scores each track→set match on match confidence, timestamp
  quality, tracklist completeness, recency, and on-site engagement
  (deliberately **not** DJ or platform popularity, per the spec). A greedy
  diversity pass then caps how many results from the same DJ/event/platform
  land in the default ~12-result page, so one prolific DJ can't dominate —
  "Explore all" still shows everything unfiltered. `weightedRandomPick()`
  powers "Give me a set," biased toward useful results without being
  deterministic.
- **`catalog.ts`** — page data loaders (track/artist/DJ/event/set), each
  restricted to confidently-matched, fully-processed data — no thin or
  unmatched content shown publicly.

### Admin (`/admin`)

Single shared password (`ADMIN_PASSWORD`), signed session cookie
(`lib/adminAuth.ts`), gated by `src/proxy.ts`. No user accounts — intentional
for a single-operator MVP.

- **Overview** — the exact metrics from the spec (totals, recently
  discovered, processed, failed, pending review, pending submissions,
  duplicate candidates), plus per-source health with a "Run now" button.
- **Review queue** — approve/reject uncertain matches.
- **Submissions** — every user-submitted URL and what happened to it.
- **Sources** — adapter status and recent ingestion run history.
- **Analytics** — see below.

### Analytics (`src/lib/analytics/`)

First-party only — no third-party trackers, no cross-site cookies. One random
anonymous cookie identifies a browser across visits purely to measure
"returning visitor"; nothing else is attached to it. Tracks: searches (with
normalized query, result type, result count), **zero-result searches
specifically** (the coverage-gap signal called out in the spec), clicks by
type (set result / timestamp play / track / artist / random), and page views
with a simple organic-referrer heuristic (Google/Bing/DuckDuckGo/Yahoo).
Surfaced at `/admin/analytics`.

### SEO

Clean URLs (`/track/[slug]`, `/artist/[slug]`, `/dj/[slug]`, `/event/[slug]`,
`/set/[slug]`), per-page metadata + canonical URLs (`generateMetadata` on
every detail page), `MusicPlaylist` JSON-LD structured data on set pages, a
sitemap (`app/sitemap.ts`, regenerated hourly, only including entities that
actually have confidently-matched processed data — no thin pages), and
`robots.ts` disallowing `/admin`, `/api/`, `/go/` (the click-tracking
redirects) while allowing everything else.

### "Add a DJ set" (`/submit`)

No account required. Validates the URL is from a currently-enabled adapter's
domain, checks for an existing `(platform, external_id)` match, and — if
new — runs it through the exact same `processDiscoveredSet` pipeline as
scheduled ingestion, so a user submission gets identical matching/provenance
guarantees. Every submission is recorded in `user_submissions` regardless of
outcome, visible in the admin panel.

## Deploying it for real

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full step-by-step runbook
(Neon + Vercel, exact CLI commands, which env vars are required, and how to
verify live Mixcloud ingestion after launch). Summary:

1. **Database:** create a free Postgres on [Neon](https://neon.tech). Copy
   the pooled connection string into `DATABASE_URL`.
2. **Run migrations against it** — before the first deploy, since the build
   itself queries the database (see below):
   ```bash
   DATABASE_URL="<your neon url>" npm run db:migrate
   DATABASE_URL="<your neon url>" psql "<your neon url>" -f scripts/sql/post-migrate.sql
   ```
3. **Deploy the app** — [Vercel](https://vercel.com) is the path of least
   resistance for Next.js: set the environment variables (generate real,
   unique `ADMIN_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET` — never reuse the
   dev placeholders in `.env`; leave `ENABLE_DEMO_FIXTURES` unset), then
   deploy. `NEXT_PUBLIC_SITE_URL` must be set to the real production URL
   *before* the build runs — Next.js inlines `NEXT_PUBLIC_*` vars at build
   time, so setting it after deploying has no effect until the next rebuild.
4. **Get real data in:** either wait for the next scheduled Vercel Cron run
   (`vercel.json`, every 6h), trigger it manually by visiting
   `/api/cron/ingest` with the right `Authorization` header, or click "Run
   now" next to a source in `/admin/sources`. Skip `npm run seed` in
   production — that writes the sandbox's hard-coded demo fixture data, and
   in fact the `demo_fixture` adapter is compiled out entirely unless
   `ENABLE_DEMO_FIXTURES=true` is set (it must not be, in production).
5. Optionally add `YOUTUBE_API_KEY` to turn on the second source adapter with
   no code changes.
6. **Verify `WATCHED_MIXCLOUD_USERS`** in `src/lib/ingestion/sources.config.ts`
   — `nts-radio`, `residentadvisor`, `defected` are reasonable guesses at
   real, tracklist-heavy Mixcloud accounts, made without live network access
   to confirm they exist or are still active. Check them (or replace them)
   before or right after the first live ingestion run.

### Why the build itself needs a working `DATABASE_URL`

`src/app/sitemap.ts` queries the database at build time (Next prerenders
`/sitemap.xml` as a static route with hourly revalidation). This means: run
migrations against Neon *before* the first Vercel build, not after, or the
build will fail with a connection error. This isn't a demo-only requirement
— it's true of every build, including rebuilds after a schema change.

Ongoing cost at this scale: a free/cheap serverless Postgres tier, a free
Vercel Hobby deployment, $0 in required third-party API costs (Mixcloud and
MusicBrainz are both free and keyless). This can run indefinitely without a
bill until traffic or catalog size genuinely outgrow the free tiers.

## What's deliberately out of scope for V1

- **Audio fingerprinting.** The spec explicitly asks for this to be
  out-of-scope for the MVP hypothesis test. The adapter interface doesn't
  care how a tracklist was obtained, so an audio-ID adapter (Shazam-style)
  could be added later as just another `SourceAdapter` implementation.
- **1001tracklists** (or similar) as a source — it has no public API and
  scraping it would violate its terms, which the spec explicitly rules out.
  If a licensing/data-partnership arrangement existed, it would become
  another adapter.
- **Spotify/SoundCloud metadata enrichment** — architected for (see
  `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` in `.env.example`) but not
  wired up; no credentials were available for this build. MusicBrainz alone
  covers the alias/canonicalization need for V1.
- **User accounts, paid tiers, ads, playlist creation** — the spec asks
  explicitly not to build these yet, only to not architect against them.
  Nothing here — clean per-entity pages, a `viewCount`/`clickCount` on sets,
  isolated ranking logic — should make adding any of them later awkward.

## Known limitations / good next steps

- The event/venue name for a Mixcloud set is inferred heuristically from the
  title (Mixcloud's API has no dedicated "event" field) — see the comment in
  `adapters/mixcloud.ts`. It's conservative (skips rather than guesses when
  the title doesn't fit the pattern) but will miss some real events and
  occasionally group by upload title in a way a human wouldn't.
- Duplicate-set detection in the admin panel is a simple same-title/
  same-platform heuristic — good enough to surface obvious reposts, not a
  full fuzzy duplicate detector.
- Search ranking weights (`lib/search/rank.ts`) are reasoned defaults, not
  tuned against real usage yet — the admin analytics page exists specifically
  so they can be tuned once there's real click/search data.
- At meaningfully larger scale, the artist-page loader (`getAppearancesForTrack`
  called once per track) and the JS-side ranking pass would move to
  pre-computed/materialized scores; noted in code comments where relevant.
