import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArtistBySlug } from "@/lib/search/catalog";
import { getAppearancesForTrack } from "@/lib/search/appearances";
import { scoreAppearances, applyFilter } from "@/lib/search/rank";
import { formatTimestamp } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);
  if (!artist) return {};
  return {
    title: `${artist.name} — tracks found in DJ sets`,
    description: `Every ${artist.name} track we've found played inside a DJ set, and which sets play them.`,
    alternates: { canonical: `/artist/${artist.slug}` },
  };
}

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);
  if (!artist) notFound();

  const tracksWithTop = await Promise.all(
    artist.tracks.map(async (t) => {
      const rows = await getAppearancesForTrack(t.id);
      const top = applyFilter(scoreAppearances(rows), "top").slice(0, 3);
      return { ...t, top };
    })
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-2 text-sm text-muted">
        <Link href="/" className="hover:underline">Search</Link> / Artist
      </div>
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-1">{artist.name}</h1>
      {artist.disambiguation && <p className="text-muted mb-1">{artist.disambiguation}</p>}
      {artist.aliases.length > 0 ? (
        <p className="text-xs text-muted mb-6">also known as {artist.aliases.join(", ")}</p>
      ) : (
        <div className="mb-6" />
      )}

      {tracksWithTop.length === 0 ? (
        <p className="text-muted">No tracks by this artist have turned up in an indexed set yet.</p>
      ) : (
        <div className="space-y-8">
          {tracksWithTop.map((t) => (
            <section key={t.id}>
              <div className="flex items-baseline justify-between mb-3">
                <Link href={`/track/${t.slug}`} className="text-lg font-medium hover:text-accent">
                  {t.title}
                </Link>
                <span className="text-sm text-muted">
                  {t.appearanceCount} {t.appearanceCount === 1 ? "set" : "sets"}
                </span>
              </div>
              <ul className="space-y-1.5">
                {t.top.map((row) => (
                  <li key={row.appearanceId} className="text-sm flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2">
                    <span className="truncate">
                      {row.djs.map((d) => d.name).join(" b2b ") || "Unknown DJ"} —{" "}
                      <Link href={`/set/${row.setSlug}`} className="text-muted hover:text-foreground">{row.setTitle}</Link>
                    </span>
                    <span className="timestamp text-accent shrink-0">{formatTimestamp(row.timestampSec)}</span>
                  </li>
                ))}
              </ul>
              {t.appearanceCount > t.top.length && (
                <Link href={`/track/${t.slug}`} className="text-xs text-muted hover:text-foreground underline mt-1.5 inline-block">
                  See all {t.appearanceCount} →
                </Link>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
