import type { MetadataRoute } from "next";
import { or, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// The catalog grows continuously via scheduled ingestion, so the sitemap
// must not be frozen at build time — regenerate it hourly (ISR) rather than
// only on redeploy.
export const revalidate = 3600;

// Google's per-sitemap cap is 50,000 URLs; this MVP is nowhere near that, so
// a single sitemap file is fine. If the catalog grows large, switch this to
// generateSitemaps() and split by entity type.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/submit`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.2 },
  ];

  // Only tracks/artists that actually have at least one confidently-matched,
  // processed appearance get a page — no thin pages for SEO's sake.
  const tracksWithData = await db.execute(sql`
    SELECT DISTINCT t.slug, t.updated_at
    FROM tracks t
    JOIN track_appearances ta ON ta.track_id = t.id AND ta.match_status = 'AUTO_MATCHED'
    JOIN dj_sets s ON s.id = ta.set_id AND s.import_status IN ('PROCESSED', 'PARTIAL')
  `);
  const artistsWithData = await db.execute(sql`
    SELECT DISTINCT a.slug, a.updated_at
    FROM artists a
    JOIN track_artists ta2 ON ta2.artist_id = a.id
    JOIN track_appearances ta ON ta.track_id = ta2.track_id AND ta.match_status = 'AUTO_MATCHED'
    JOIN dj_sets s ON s.id = ta.set_id AND s.import_status IN ('PROCESSED', 'PARTIAL')
  `);
  const sets = await db
    .select({ slug: schema.djSets.slug, updatedAt: schema.djSets.updatedAt })
    .from(schema.djSets)
    .where(or(eq(schema.djSets.importStatus, "PROCESSED"), eq(schema.djSets.importStatus, "PARTIAL")));
  const djsWithData = await db.execute(sql`
    SELECT DISTINCT d.slug, d.updated_at
    FROM djs d
    JOIN set_djs sd ON sd.dj_id = d.id
    JOIN dj_sets s ON s.id = sd.set_id AND s.import_status IN ('PROCESSED', 'PARTIAL')
  `);
  const eventsWithData = await db.execute(sql`
    SELECT DISTINCT e.slug, e.updated_at
    FROM events e
    JOIN dj_sets s ON s.event_id = e.id AND s.import_status IN ('PROCESSED', 'PARTIAL')
  `);

  const dynamic: MetadataRoute.Sitemap = [
    ...(tracksWithData.rows as any[]).map((r) => ({
      url: `${SITE_URL}/track/${r.slug}`,
      lastModified: r.updated_at ? new Date(r.updated_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...(artistsWithData.rows as any[]).map((r) => ({
      url: `${SITE_URL}/artist/${r.slug}`,
      lastModified: r.updated_at ? new Date(r.updated_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...sets.map((s) => ({
      url: `${SITE_URL}/set/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...(djsWithData.rows as any[]).map((r) => ({
      url: `${SITE_URL}/dj/${r.slug}`,
      lastModified: r.updated_at ? new Date(r.updated_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...(eventsWithData.rows as any[]).map((r) => ({
      url: `${SITE_URL}/event/${r.slug}`,
      lastModified: r.updated_at ? new Date(r.updated_at) : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];

  return [...staticPages, ...dynamic];
}
