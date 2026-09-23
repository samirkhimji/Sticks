# Deploying Diggr to Vercel + Neon

This is the exact, step-by-step path from this codebase to a live URL, using
the two simplest free-tier services: **Neon** for Postgres and **Vercel**
for hosting. It assumes you have Node.js and `git` installed locally, and
that you've unzipped the project somewhere on your machine.

Steps marked **(you)** require your own accounts/credentials — I can't create
accounts or hold secrets on your behalf. Steps marked **(either)** you can
run yourself from a terminal, following the exact commands given.

---

## 0. Before you start: what NOT to reuse

The `.env` file in this project has working **local development** secrets
(`changeme-admin-pw`, `dev-only-secret-change-in-production-please`, etc.)
and `ENABLE_DEMO_FIXTURES="true"`. None of these are safe for production:

- `ENABLE_DEMO_FIXTURES` must be **unset** (or `"false"`) in your Vercel
  project. It's what keeps the fake demo-fixture data source from ever
  appearing in the production admin panel.
- `ADMIN_PASSWORD`, `SESSION_SECRET`, and `CRON_SECRET` must all be **freshly
  generated** values, not the placeholders. `.env` and `.env` itself are
  already git-ignored, so they were never meant to leave your machine.

## 1. Push the code to GitHub (you)

Vercel's simplest deploy flow imports a GitHub repo. If this project isn't
in a repo yet:

```bash
cd diggr
git init
git add .
git commit -m "Initial commit"
```

Create a new empty repository on [github.com/new](https://github.com/new),
then:

```bash
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```

## 2. Create the database on Neon (you)

1. Go to [neon.tech](https://neon.tech) and sign up (GitHub sign-in is
   fastest).
2. Create a new project. Any region close to where Vercel will run is fine
   (Neon's free tier is generous — this app is nowhere near its limits).
3. On the project dashboard, copy the **pooled connection string** (Neon
   shows both a direct and a pooled one — use the pooled one, it's meant for
   serverless apps like this). It looks like:
   ```
   postgresql://neondb_owner:...@ep-....neon.tech/neondb?sslmode=require
   ```
   Keep this tab open; you'll need this value twice (once now, once in
   Vercel).

## 3. Run migrations against Neon — before the first deploy (either)

This is the one step order that matters: `src/app/sitemap.ts` queries the
database while Next.js is *building* the app (it prerenders `/sitemap.xml`
as a static route). If the database isn't migrated yet, **the Vercel build
will fail**. So run this from your own machine first, pointed at Neon:

```bash
cd diggr
npm install
DATABASE_URL="<paste your Neon connection string>" npm run db:migrate
DATABASE_URL="<paste your Neon connection string>" psql "<paste your Neon connection string>" -f scripts/sql/post-migrate.sql
```

The first command creates all the tables (artists, tracks, djs, dj_sets,
appearances, etc.). The second adds the `pg_trgm`/`unaccent` extensions and
trigram indexes that fuzzy/typo-tolerant search depends on — Neon supports
both extensions out of the box. If you don't have `psql` installed locally,
Neon's dashboard has a built-in SQL editor — paste the contents of
`scripts/sql/post-migrate.sql` there instead.

Do **not** run `npm run seed` against this database — that command loads
the sandbox's hard-coded demo tracklist (OMFO / DJ Rino / Waking Life 2024)
used only to prove the pipeline works without network access during
development. Production should start empty and fill up from real Mixcloud
ingestion (step 6).

## 4. Create the Vercel project and set environment variables (you, then either)

1. Go to [vercel.com](https://vercel.com), sign up, click **Add New →
   Project**, and import the GitHub repo from step 1.
2. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value | Notes |
   |---|---|---|
   | `DATABASE_URL` | your Neon pooled connection string | same one from step 2 |
   | `ADMIN_PASSWORD` | a real password you'll remember | not the `.env` placeholder |
   | `SESSION_SECRET` | output of `openssl rand -hex 32` | run that command locally, paste the result |
   | `CRON_SECRET` | output of `openssl rand -hex 32` | a second, different random value |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` (or your custom domain) | **must be set before the first build** — see below |
   | `NEXT_PUBLIC_SITE_NAME` | `Sticks` (or whatever you want shown in the UI) | |
   | `YOUTUBE_API_KEY` | *(optional)* | only if you want the YouTube adapter live; leave blank to skip |

   Do **not** add `ENABLE_DEMO_FIXTURES` at all.

   Generate the two random secrets locally:
   ```bash
   openssl rand -hex 32
   ```
   (run it twice, once for each of `SESSION_SECRET` and `CRON_SECRET`).

   **Why `NEXT_PUBLIC_SITE_URL` has to be right before deploying:** Next.js
   bakes `NEXT_PUBLIC_*` values into the JavaScript bundle at build time.
   You can only guess your `.vercel.app` URL before the first deploy (Vercel
   usually derives it from the project name — check the "Domains" tab after
   creating the project, before hitting Deploy, to confirm it). If you get
   it wrong, or add a custom domain later, update this variable and
   **redeploy** — editing the env var alone does nothing until the next
   build.

3. Click **Deploy**.

## 5. Confirm the deploy is healthy (either)

Once Vercel finishes building:

- Visit the site root — the homepage search box should load.
- Visit `/sitemap.xml` — should return XML (confirms build-time DB access
  worked).
- Visit `/admin` — should redirect to `/admin/login` and show a plain
  password field, **not** a "server misconfigured" message. If you see the
  misconfigured message, `ADMIN_PASSWORD` and/or `SESSION_SECRET` weren't
  picked up — recheck the Vercel env vars and redeploy.
- Log in at `/admin/login` with your `ADMIN_PASSWORD`, then open
  `/admin/sources` — you should see exactly two adapters listed, **Mixcloud**
  and **YouTube** (or just Mixcloud if you skipped the YouTube key). If you
  see a third "demo_fixture" adapter here, `ENABLE_DEMO_FIXTURES` is set to
  `true` somewhere in your Vercel env vars — remove it and redeploy before
  going further, since its "Run now" button would inject fake data.

## 6. Test live Mixcloud ingestion (either) — first priority after deploy

The Mixcloud adapter is keyless and needs no setup beyond being deployed.
`src/lib/ingestion/sources.config.ts` currently watches three accounts —
`nts-radio`, `residentadvisor`, `defected` — chosen as well-known,
tracklist-heavy Mixcloud accounts, but **not verified live** (this project
was built in a sandboxed environment with no outbound access to
mixcloud.com to confirm they still exist or are still active). Before or
right after your first real run, spot-check them at
`https://www.mixcloud.com/<username>/` and swap in different accounts in
that file if any have gone stale, then commit and redeploy.

To trigger a real ingestion run:

- **From the admin UI:** log in to `/admin/sources`, click "Run now" next
  to Mixcloud.
- **Or via the cron endpoint directly:**
  ```bash
  curl -i "https://<your-site>/api/cron/ingest?only=mixcloud" \
    -H "Authorization: Bearer <your CRON_SECRET>"
  ```

Then check:

1. `/admin/sources` — the new row under "Recent ingestion runs" should show
   `status: SUCCEEDED` (or `PARTIAL`) with a non-zero "Discovered / Created"
   count. `FAILED` with 0s usually means either the watched account has no
   public cloudcasts with tracklists, or Mixcloud's API is temporarily
   unreachable — check `/admin/sources`' "disabled reason" text and retry.
2. `/admin` (the main dashboard) — "Total sets", "Total tracks", and "Total
   artists" should all be greater than zero.
3. **Search for real results:** pick an artist or track name you know is in
   one of the newly-ingested sets and search for it on the homepage. You
   should land on a real artist/track page showing genuine Mixcloud sets —
   not the OMFO/Waking Life fixture, which will not exist in this database
   at all unless you mistakenly ran `npm run seed` against it.
4. Open one of the new set pages and confirm the embedded Mixcloud player
   loads and the timestamped tracklist is populated.

If nothing has tracklist data yet, it's worth trying a few different
Mixcloud accounts known for structured tracklists (NTS Radio shows, Boiler
Room uploads, label showcase mixes) — not every upload has one, and the
adapter is intentionally conservative: it stores `tracklistCompleteness:
NONE` rather than guessing at a tracklist that isn't there.

## 7. Set up recurring ingestion (either)

`vercel.json` already schedules `/api/cron/ingest` once a day (Vercel's
**free Hobby plan only allows cron jobs to run once per day** — a schedule
of every few hours, as you might reasonably want, will fail deployment on
Hobby). This just works once deployed; there's nothing to configure.

If you want ingestion to run more often than daily, either:
- Upgrade the Vercel project to the Pro plan, which allows per-minute cron
  schedules, and tighten `vercel.json`'s schedule; or
- Use `.github/workflows/ingest.yml` instead/in addition — it runs from
  GitHub Actions (every 4 hours by default) and isn't subject to Vercel's
  Hobby limit. It needs two repo secrets set under
  **Settings → Secrets and variables → Actions**: `SITE_URL` (your deployed
  URL) and `CRON_SECRET` (the same value you set in Vercel).

## 8. Ongoing cost

At this scale: Neon's free tier, Vercel's free Hobby tier, $0 in required
third-party API costs (Mixcloud and MusicBrainz are both free and keyless).
This can run indefinitely with no bill until traffic or catalog size
genuinely outgrow the free tiers.

---

### Troubleshooting quick reference

| Symptom | Likely cause |
|---|---|
| Build fails with a Postgres connection error | Migrations weren't run against Neon before deploying (step 3) |
| `/admin/login` shows "server misconfigured" | `ADMIN_PASSWORD` or `SESSION_SECRET` missing in Vercel env vars |
| `demo_fixture` shows up in `/admin/sources` | `ENABLE_DEMO_FIXTURES` is set in Vercel — remove it and redeploy |
| Mixcloud ingestion runs but finds nothing | Watched accounts in `sources.config.ts` may be stale/wrong — verify them live |
| Vercel deploy fails validating `vercel.json` | Cron schedule runs more than once/day on the Hobby plan — see step 7 |
| Links/canonical URLs point at `localhost:3000` in production | `NEXT_PUBLIC_SITE_URL` wasn't set before the build ran — set it and redeploy |
