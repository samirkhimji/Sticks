// The ingestion orchestrator. This is the one place that turns
// "adapter.discoverNew() output" into rows in the database, via the
// normalization/resolve layer. Both the scheduled cron job and the
// user-submission flow call into this, so they behave identically and share
// the same dedup/matching/provenance guarantees.

import { eq, and, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DiscoveredSet, ParsedTrackEntry, SourceAdapter } from "./types";
import { resolveArtist, resolveDj, resolveTrack } from "@/lib/normalize/resolve";
import { normalizeText, slugify } from "@/lib/normalize/text";
import { getAdapter, listAdapters } from "./registry";

export async function ensureSourcePlatform(adapter: SourceAdapter) {
  const [existing] = await db
    .select()
    .from(schema.sourcePlatforms)
    .where(eq(schema.sourcePlatforms.key, adapter.platformKey))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(schema.sourcePlatforms)
    .values({
      key: adapter.platformKey,
      name: adapter.platformName,
      baseUrl: adapter.baseUrl,
      adapterKey: adapter.adapterKey,
      supportsTimestampLinks: adapter.supportsTimestampLinks,
    })
    .returning();
  return created;
}

export async function ensureAllSourcePlatforms() {
  const out = [];
  for (const adapter of listAdapters()) out.push(await ensureSourcePlatform(adapter));
  return out;
}

function computeCompleteness(
  entries: ParsedTrackEntry[],
  durationSec?: number | null
): "NONE" | "PARTIAL" | "FULL" {
  if (entries.length === 0) return "NONE";
  const withTs = entries.filter((e) => typeof e.timestampSec === "number");
  if (withTs.length === 0) return "PARTIAL";
  const last = Math.max(...withTs.map((e) => e.timestampSec!));
  if (durationSec && durationSec > 0) {
    const coverage = last / durationSec;
    if (coverage >= 0.7 && entries.length >= 3) return "FULL";
  }
  return entries.length >= 6 ? "FULL" : "PARTIAL";
}

async function upsertEvent(name: string | undefined, type: DiscoveredSet["eventType"], year?: number) {
  if (!name) return null;
  const slugBase = year ? `${name}-${year}` : name;
  const slug = slugify(slugBase);
  const [existing] = await db.select().from(schema.events).where(eq(schema.events.slug, slug)).limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(schema.events)
    .values({ name, slug, type: type ?? "OTHER", year })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;
  const [fallback] = await db.select().from(schema.events).where(eq(schema.events.slug, slug)).limit(1);
  return fallback?.id ?? null;
}

async function uniqueSetSlug(base: string) {
  let candidate = slugify(base);
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [row] = await db.select({ id: schema.djSets.id }).from(schema.djSets).where(eq(schema.djSets.slug, candidate)).limit(1);
    if (!row) return candidate;
    candidate = `${slugify(base)}-${n}`;
    n++;
  }
}

export interface ProcessResult {
  outcome: "created" | "updated" | "skipped_duplicate" | "failed";
  setId?: string;
  error?: string;
}

/**
 * Steps 2-9 from the spec for a single discovered set: dedup check, create/
 * update the DjSet row, resolve its DJ(s) and event, parse + normalize the
 * tracklist, and record everything with provenance and confidence intact.
 */
export async function processDiscoveredSet(
  discovered: DiscoveredSet,
  adapter: SourceAdapter,
  sourcePlatformId: string
): Promise<ProcessResult> {
  try {
    // Step 2: does it already exist?
    const [existing] = await db
      .select()
      .from(schema.djSets)
      .where(
        and(
          eq(schema.djSets.sourcePlatformId, sourcePlatformId),
          eq(schema.djSets.externalId, discovered.externalId)
        )
      )
      .limit(1);

    if (existing && existing.importStatus === "PROCESSED") {
      await db
        .update(schema.djSets)
        .set({ lastCheckedAt: new Date() })
        .where(eq(schema.djSets.id, existing.id));
      return { outcome: "skipped_duplicate", setId: existing.id };
    }

    const year = discovered.publishedAt?.getFullYear();
    const eventId = await upsertEvent(discovered.eventName, discovered.eventType, discovered.eventYear ?? year);

    let setId: string;
    if (existing) {
      setId = existing.id;
      await db
        .update(schema.djSets)
        .set({
          title: discovered.title,
          embedUrl: discovered.embedUrl,
          thumbnailUrl: discovered.thumbnailUrl,
          description: discovered.description,
          durationSec: discovered.durationSec,
          publishedAt: discovered.publishedAt,
          yearKnown: year,
          eventId,
          importStatus: "PROCESSING",
          rawPayload: discovered.rawPayload as any,
          isDemoFixture: !!discovered.isDemoFixture,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.djSets.id, setId));
    } else {
      const slug = await uniqueSetSlug(`${discovered.djNames[0] ?? "unknown"}-${discovered.title}`);
      const [createdSet] = await db
        .insert(schema.djSets)
        .values({
          title: discovered.title,
          slug,
          sourcePlatformId,
          externalId: discovered.externalId,
          sourceUrl: discovered.sourceUrl,
          embedUrl: discovered.embedUrl,
          thumbnailUrl: discovered.thumbnailUrl,
          description: discovered.description,
          durationSec: discovered.durationSec,
          publishedAt: discovered.publishedAt,
          yearKnown: year,
          eventId,
          importStatus: "PROCESSING",
          rawPayload: discovered.rawPayload as any,
          isDemoFixture: !!discovered.isDemoFixture,
          lastCheckedAt: new Date(),
        })
        .returning();
      setId = createdSet.id;
    }

    // Resolve DJ(s) — step 7 (normalize) applied to the DJ field too.
    for (const rawDjName of discovered.djNames) {
      // "A b2b B" style names: split so both get their own canonical DJ row
      // in addition to the combined display name already on the set title.
      const parts = rawDjName.split(/\s+b2b\s+|\s+back to back\s+/i);
      for (const part of parts) {
        const djResolve = await resolveDj(part);
        if (djResolve.entityId) {
          await db
            .insert(schema.setDjs)
            .values({ setId, djId: djResolve.entityId })
            .onConflictDoNothing();
        }
      }
    }

    // Steps 3-6: fetch/parse tracklist, normalize each entry.
    const entries = await adapter.parseTracklist(discovered);
    let matchedCount = 0;
    let reviewCount = 0;

    // Clear any previously-recorded appearances before re-inserting (keeps
    // re-processing idempotent instead of duplicating rows on re-runs).
    await db.delete(schema.trackAppearances).where(eq(schema.trackAppearances.setId, setId));

    for (const entry of entries) {
      const artistResolve = await resolveArtist(entry.rawArtistText);
      const trackResolve = await resolveTrack(entry.rawTitleText, artistResolve.entityId);

      const isReview = artistResolve.status === "review" || trackResolve.status === "review";
      const confidence = Math.min(
        artistResolve.status === "review" ? artistResolve.confidence : 1,
        trackResolve.status === "review" ? trackResolve.confidence : 1,
        artistResolve.confidence,
        trackResolve.confidence
      );

      const [appearance] = await db
        .insert(schema.trackAppearances)
        .values({
          setId,
          trackId: trackResolve.entityId,
          position: entry.position,
          rawArtistText: entry.rawArtistText,
          rawTitleText: entry.rawTitleText,
          matchedArtistId: artistResolve.entityId,
          timestampSec: entry.timestampSec,
          timestampConfidence: entry.timestampConfidence,
          matchConfidence: confidence,
          matchStatus: isReview ? "NEEDS_REVIEW" : "AUTO_MATCHED",
          sourceNote: entry.sourceNote,
        })
        .returning();

      if (isReview) {
        reviewCount++;
        // Link the appearance back into whichever review item(s) resolve() created.
        for (const reviewItemId of [artistResolve.reviewItemId, trackResolve.reviewItemId].filter(Boolean)) {
          await db
            .update(schema.reviewQueueItems)
            .set({
              details: sql`${schema.reviewQueueItems.details} || ${JSON.stringify({
                appearanceId: appearance.id,
                setId,
              })}::jsonb`,
            })
            .where(eq(schema.reviewQueueItems.id, reviewItemId as string));
        }
      } else {
        matchedCount++;
      }
    }

    const completeness = computeCompleteness(entries, discovered.durationSec);
    const importStatus =
      entries.length === 0
        ? "PROCESSED"
        : reviewCount > 0 && matchedCount === 0
        ? "NEEDS_REVIEW"
        : reviewCount > 0
        ? "PARTIAL"
        : "PROCESSED";

    await db
      .update(schema.djSets)
      .set({ importStatus, tracklistCompleteness: completeness, importError: null, updatedAt: new Date() })
      .where(eq(schema.djSets.id, setId));

    return { outcome: existing ? "updated" : "created", setId };
  } catch (err: any) {
    // A single bad set must never take down the whole ingestion run.
    const [existing] = await db
      .select({ id: schema.djSets.id })
      .from(schema.djSets)
      .where(
        and(
          eq(schema.djSets.sourcePlatformId, sourcePlatformId),
          eq(schema.djSets.externalId, discovered.externalId)
        )
      )
      .limit(1);
    if (existing) {
      await db
        .update(schema.djSets)
        .set({ importStatus: "FAILED", importError: String(err?.message ?? err) })
        .where(eq(schema.djSets.id, existing.id));
    }
    return { outcome: "failed", error: String(err?.message ?? err) };
  }
}

export interface RunSummary {
  runId: string;
  discovered: number;
  created: number;
  updated: number;
  failed: number;
  status: "SUCCEEDED" | "FAILED" | "PARTIAL";
}

export async function runIngestion(
  adapterKey: string,
  opts: { limit?: number; trigger?: "SCHEDULED" | "MANUAL" | "USER_SUBMISSION" } = {}
): Promise<RunSummary> {
  const adapter = getAdapter(adapterKey);
  if (!adapter) throw new Error(`Unknown adapter: ${adapterKey}`);
  const platform = await ensureSourcePlatform(adapter);

  const [run] = await db
    .insert(schema.ingestionRuns)
    .values({ sourcePlatformId: platform.id, trigger: opts.trigger ?? "SCHEDULED" })
    .returning();

  if (!adapter.isEnabled()) {
    await db
      .update(schema.ingestionRuns)
      .set({
        status: "FAILED",
        finishedAt: new Date(),
        errorLog: adapter.disabledReason?.() ?? "Adapter disabled",
      })
      .where(eq(schema.ingestionRuns.id, run.id));
    return { runId: run.id, discovered: 0, created: 0, updated: 0, failed: 0, status: "FAILED" };
  }

  let discovered: DiscoveredSet[] = [];
  const errors: string[] = [];
  try {
    discovered = await adapter.discoverNew(opts.limit ?? 20);
  } catch (err: any) {
    errors.push(String(err?.message ?? err));
  }

  let created = 0,
    updated = 0,
    failed = 0;

  for (const set of discovered) {
    const result = await processDiscoveredSet(set, adapter, platform.id);
    if (result.outcome === "created") created++;
    else if (result.outcome === "updated") updated++;
    else if (result.outcome === "failed") {
      failed++;
      if (result.error) errors.push(result.error);
    }
  }

  const status: RunSummary["status"] = failed === 0 ? "SUCCEEDED" : created + updated > 0 ? "PARTIAL" : "FAILED";

  await db
    .update(schema.ingestionRuns)
    .set({
      status,
      finishedAt: new Date(),
      setsDiscovered: discovered.length,
      setsCreated: created,
      setsUpdated: updated,
      setsFailed: failed,
      errorLog: errors.length ? errors.slice(0, 20).join("\n") : null,
    })
    .where(eq(schema.ingestionRuns.id, run.id));

  return { runId: run.id, discovered: discovered.length, created, updated, failed, status };
}

/** Used by the "Add a DJ set" public submission flow. */
export async function processSubmissionUrl(url: string): Promise<{
  status: "queued" | "duplicate" | "processed" | "rejected";
  setSlug?: string;
  reason?: string;
}> {
  const candidateAdapters = listAdapters().filter((a) => a.adapterKey !== "demo_fixture");
  let matchedAdapter = null as (typeof candidateAdapters)[number] | null;
  for (const adapter of candidateAdapters) {
    try {
      const u = new URL(url);
      const base = new URL(adapter.baseUrl);
      if (u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "")) {
        matchedAdapter = adapter;
        break;
      }
    } catch {
      // invalid URL entirely
    }
  }

  if (!matchedAdapter) {
    return { status: "rejected", reason: "URL isn't from a currently supported source (Mixcloud, YouTube)." };
  }
  if (!matchedAdapter.isEnabled()) {
    return {
      status: "rejected",
      reason: matchedAdapter.disabledReason?.() ?? "That source isn't enabled yet.",
    };
  }

  const platform = await ensureSourcePlatform(matchedAdapter);

  const discovered = await matchedAdapter.fetchByUrl(url);
  if (!discovered) {
    return { status: "rejected", reason: "Couldn't fetch metadata for that URL." };
  }

  const [existing] = await db
    .select({ id: schema.djSets.id, slug: schema.djSets.slug })
    .from(schema.djSets)
    .where(
      and(
        eq(schema.djSets.sourcePlatformId, platform.id),
        eq(schema.djSets.externalId, discovered.externalId)
      )
    )
    .limit(1);
  if (existing) {
    return { status: "duplicate", setSlug: existing.slug };
  }

  const result = await processDiscoveredSet(discovered, matchedAdapter, platform.id);
  if (result.outcome === "failed") {
    return { status: "rejected", reason: result.error };
  }
  const [set] = await db.select({ slug: schema.djSets.slug }).from(schema.djSets).where(eq(schema.djSets.id, result.setId!));
  return { status: "processed", setSlug: set?.slug };
}
