import { sql, gte, eq, and } from "drizzle-orm";
import { db, schema } from "@/db";

const WINDOW_DAYS = 30;

export async function getAnalyticsSummary() {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [visitorCount] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.visitors)
    .where(gte(schema.visitors.lastSeen, since));

  const [returningCount] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.visitors)
    .where(and(gte(schema.visitors.lastSeen, since), sql`${schema.visitors.visitCount} > 1`));

  const [totalSearches] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.searchEvents)
    .where(gte(schema.searchEvents.createdAt, since));

  const [zeroResultSearches] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.searchEvents)
    .where(and(gte(schema.searchEvents.createdAt, since), eq(schema.searchEvents.resultType, "ZERO_RESULTS")));

  const [organicViews] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.pageViews)
    .where(and(gte(schema.pageViews.createdAt, since), eq(schema.pageViews.isOrganic, true)));

  const [totalViews] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.pageViews)
    .where(gte(schema.pageViews.createdAt, since));

  const topQueries = await db.execute(sql`
    SELECT normalized_query, count(*)::int AS count
    FROM search_events
    WHERE created_at >= ${since} AND result_type != 'ZERO_RESULTS'
    GROUP BY normalized_query
    ORDER BY count DESC
    LIMIT 15
  `);

  const zeroResultQueries = await db.execute(sql`
    SELECT normalized_query, count(*)::int AS count
    FROM search_events
    WHERE created_at >= ${since} AND result_type = 'ZERO_RESULTS'
    GROUP BY normalized_query
    ORDER BY count DESC
    LIMIT 20
  `);

  const clicksByType = await db.execute(sql`
    SELECT type, count(*)::int AS count
    FROM click_events
    WHERE created_at >= ${since}
    GROUP BY type
  `);

  const submittedSets = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.userSubmissions)
    .where(gte(schema.userSubmissions.createdAt, since));

  return {
    windowDays: WINDOW_DAYS,
    visitors: visitorCount?.count ?? 0,
    returningVisitors: returningCount?.count ?? 0,
    totalSearches: totalSearches?.count ?? 0,
    zeroResultSearches: zeroResultSearches?.count ?? 0,
    organicViews: organicViews?.count ?? 0,
    totalViews: totalViews?.count ?? 0,
    topQueries: topQueries.rows as { normalized_query: string; count: number }[],
    zeroResultQueries: zeroResultQueries.rows as { normalized_query: string; count: number }[],
    clicksByType: clicksByType.rows as { type: string; count: number }[],
    submittedSets: submittedSets[0]?.count ?? 0,
  };
}
