import { sql, eq, desc, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export async function getOverviewStats() {
  const [{ count: totalSets }] = await db.execute(sql`SELECT count(*)::int AS count FROM dj_sets`).then((r) => r.rows as any[]);
  const [{ count: totalTracks }] = await db.execute(sql`SELECT count(*)::int AS count FROM tracks`).then((r) => r.rows as any[]);
  const [{ count: totalArtists }] = await db.execute(sql`SELECT count(*)::int AS count FROM artists`).then((r) => r.rows as any[]);
  const [{ count: totalAppearances }] = await db
    .execute(sql`SELECT count(*)::int AS count FROM track_appearances`)
    .then((r) => r.rows as any[]);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentlyDiscovered = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.djSets)
    .where(gte(schema.djSets.createdAt, sevenDaysAgo));

  const processed = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.djSets)
    .where(inArray(schema.djSets.importStatus, ["PROCESSED", "PARTIAL"]));

  const failedSets = await db
    .select({
      id: schema.djSets.id,
      title: schema.djSets.title,
      slug: schema.djSets.slug,
      importError: schema.djSets.importError,
      updatedAt: schema.djSets.updatedAt,
    })
    .from(schema.djSets)
    .where(eq(schema.djSets.importStatus, "FAILED"))
    .orderBy(desc(schema.djSets.updatedAt))
    .limit(20);

  const pendingReview = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.reviewQueueItems)
    .where(eq(schema.reviewQueueItems.status, "PENDING"));

  const pendingSubmissions = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.userSubmissions)
    .where(inArray(schema.userSubmissions.status, ["PENDING", "VALIDATING", "QUEUED"]));

  // Simple duplicate-candidate heuristic: same normalized title text shared
  // by more than one set on the same platform (a stronger check would also
  // compare DJ/duration, but this catches the common "reposted mix" case).
  const duplicateCandidates = await db.execute(sql`
    SELECT lower(title) AS title, source_platform_id, count(*)::int AS count, array_agg(slug) AS slugs
    FROM dj_sets
    GROUP BY lower(title), source_platform_id
    HAVING count(*) > 1
    LIMIT 20
  `);

  return {
    totalSets,
    totalTracks,
    totalArtists,
    totalAppearances,
    recentlyDiscovered: recentlyDiscovered[0]?.count ?? 0,
    processed: processed[0]?.count ?? 0,
    failedSets,
    pendingReviewCount: pendingReview[0]?.count ?? 0,
    pendingSubmissionsCount: pendingSubmissions[0]?.count ?? 0,
    duplicateCandidates: duplicateCandidates.rows as any[],
  };
}

export async function getSourceHealth() {
  const platforms = await db.select().from(schema.sourcePlatforms);
  const out = [];
  for (const p of platforms) {
    const [lastRun] = await db
      .select()
      .from(schema.ingestionRuns)
      .where(eq(schema.ingestionRuns.sourcePlatformId, p.id))
      .orderBy(desc(schema.ingestionRuns.startedAt))
      .limit(1);
    const [setCount] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.djSets)
      .where(eq(schema.djSets.sourcePlatformId, p.id));
    out.push({ platform: p, lastRun, setCount: setCount?.count ?? 0 });
  }
  return out;
}

export async function getReviewQueue() {
  return db
    .select()
    .from(schema.reviewQueueItems)
    .where(eq(schema.reviewQueueItems.status, "PENDING"))
    .orderBy(desc(schema.reviewQueueItems.createdAt))
    .limit(100);
}

export async function getSubmissions() {
  return db.select().from(schema.userSubmissions).orderBy(desc(schema.userSubmissions.createdAt)).limit(100);
}
