import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrackBySlug } from "@/lib/search/catalog";
import { getAppearancesForTrack } from "@/lib/search/appearances";
import { scoreAppearances, applyFilter, type ResultFilter } from "@/lib/search/rank";
import { ResultCard } from "@/components/ResultCard";
import { FilterTabs } from "@/components/FilterTabs";

const PAGE_SIZE = 25;

export const metadata = { title: "All sets", robots: { index: false } };

export default async function TrackAllPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { slug } = await params;
  const { filter: filterParam, page: pageParam } = await searchParams;
  const track = await getTrackBySlug(slug);
  if (!track) notFound();

  const filter = (["top", "recent", "long", "festival", "radio"].includes(filterParam ?? "")
    ? filterParam
    : "top") as ResultFilter;
  const pageNum = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const rows = await getAppearancesForTrack(track.id);
  const scored = scoreAppearances(rows);
  const filtered = applyFilter(scored, filter);
  const start = (pageNum - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-2 text-sm text-muted">
        <Link href={`/track/${track.slug}`} className="hover:underline">{track.title}</Link> / All sets
      </div>
      <h1 className="text-2xl font-semibold tracking-tight mb-6">
        All {filtered.length} sets with “{track.title}”
      </h1>

      <FilterTabs basePath={`/track/${track.slug}/all`} active={filter} />

      <ul className="space-y-3">
        {pageItems.map((row) => (
          <ResultCard key={row.appearanceId} row={row} />
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          {pageNum > 1 && (
            <Link href={`?filter=${filter}&page=${pageNum - 1}`} className="underline">← Previous</Link>
          )}
          <span className="text-muted">Page {pageNum} of {totalPages}</span>
          {pageNum < totalPages && (
            <Link href={`?filter=${filter}&page=${pageNum + 1}`} className="underline">Next →</Link>
          )}
        </div>
      )}
    </div>
  );
}
