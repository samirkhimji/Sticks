import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrackBySlug } from "@/lib/search/catalog";
import { getAppearancesForTrack } from "@/lib/search/appearances";
import { scoreAppearances, applyFilter, type ResultFilter } from "@/lib/search/rank";
import { diversify } from "@/lib/search/rank";
import { ResultCard } from "@/components/ResultCard";
import { FilterTabs } from "@/components/FilterTabs";
import { logPageView, getOrCreateVisitorId, getRefererHeader } from "@/lib/analytics";

const PAGE_SIZE = 12;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const track = await getTrackBySlug(slug);
  if (!track) return {};
  const artistNames = track.artists.map((a) => a.name).join(", ");
  const title = artistNames ? `${track.title} by ${artistNames} — DJ sets that play it` : `${track.title} — DJ sets that play it`;
  return {
    title,
    description: `Find DJ sets and mixes containing "${track.title}"${artistNames ? ` by ${artistNames}` : ""}, with timestamps to jump straight to the drop.`,
    alternates: { canonical: `/track/${track.slug}` },
  };
}

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { slug } = await params;
  const { filter: filterParam } = await searchParams;
  const track = await getTrackBySlug(slug);
  if (!track) notFound();

  getOrCreateVisitorId()
    .then(async (visitorId) => logPageView({ path: `/track/${slug}`, visitorId, referrer: await getRefererHeader() }))
    .catch(() => {});

  const filter = (["top", "recent", "long", "festival", "radio"].includes(filterParam ?? "")
    ? filterParam
    : "top") as ResultFilter;

  const rows = await getAppearancesForTrack(track.id);
  const scored = scoreAppearances(rows);
  const filtered = applyFilter(scored, filter);
  const page = filter === "top" ? diversify(filtered, PAGE_SIZE) : filtered.slice(0, PAGE_SIZE);
  const total = filtered.length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-2 text-sm text-muted">
        <Link href="/" className="hover:underline">Search</Link> / Track
      </div>
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-1">{track.title}</h1>
      {track.artists.length > 0 && (
        <p className="text-muted mb-6">
          {track.artists.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ", "}
              <Link href={`/artist/${a.slug}`} className="hover:text-foreground hover:underline">
                {a.name}
              </Link>
            </span>
          ))}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-muted">
          Indexed, but not yet linked to any processed set. Check back once ingestion runs, or{" "}
          <Link href="/submit" className="underline">submit a set</Link> that plays it.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <p className="text-sm text-muted">
              Found in <span className="text-foreground font-medium">{rows.length}</span>{" "}
              {rows.length === 1 ? "set" : "sets"}
            </p>
            {rows.length > 3 && (
              <a
                href={`/go/random/${track.slug}`}
                className="text-sm px-3 py-1.5 rounded-lg border border-border hover:border-accent"
              >
                🎲 Give me a set
              </a>
            )}
          </div>

          <FilterTabs basePath={`/track/${track.slug}`} active={filter} />

          {page.length === 0 ? (
            <p className="text-muted text-sm">No sets match this filter — try “Top matches”.</p>
          ) : (
            <ul className="space-y-3">
              {page.map((row) => (
                <ResultCard key={row.appearanceId} row={row} />
              ))}
            </ul>
          )}

          {total > page.length && (
            <div className="mt-6 text-center">
              <Link
                href={`/track/${track.slug}/all${filter !== "top" ? `?filter=${filter}` : ""}`}
                className="text-sm px-4 py-2 rounded-lg border border-border hover:border-accent inline-block"
              >
                Explore all {total} sets →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
