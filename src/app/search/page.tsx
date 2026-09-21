import Link from "next/link";
import { redirect } from "next/navigation";
import { search } from "@/lib/search/query";
import { logSearch, getOrCreateVisitorId, recordVisitor } from "@/lib/analytics";

export const metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  if (!query) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-muted">
        <p>Type a track or artist name to search.</p>
        <Link href="/" className="underline">Back home</Link>
      </div>
    );
  }

  const visitorId = await getOrCreateVisitorId();
  recordVisitor(visitorId).catch(() => {});

  const result = await search(query);
  const totalMatches = result.trackMatches.length + result.artistMatches.length + result.djMatches.length;

  // Decisive single-entity routing: an exact/near-exact track or artist match
  // should feel instant, not like a search-results page.
  if (result.exactTrack && (!result.exactArtist || result.exactTrack.score >= result.exactArtist.score)) {
    await logSearch({ query, resultType: "TRACK", resultCount: totalMatches, visitorId });
    redirect(`/track/${result.exactTrack.slug}`);
  }
  if (result.exactArtist) {
    await logSearch({ query, resultType: "ARTIST", resultCount: totalMatches, visitorId });
    redirect(`/artist/${result.exactArtist.slug}`);
  }
  if (result.trackMatches.length === 1 && result.artistMatches.length === 0 && result.trackMatches[0].score > 0.55) {
    await logSearch({ query, resultType: "TRACK", resultCount: totalMatches, visitorId });
    redirect(`/track/${result.trackMatches[0].slug}`);
  }
  if (result.artistMatches.length === 1 && result.trackMatches.length === 0 && result.artistMatches[0].score > 0.55) {
    await logSearch({ query, resultType: "ARTIST", resultCount: totalMatches, visitorId });
    redirect(`/artist/${result.artistMatches[0].slug}`);
  }

  await logSearch({
    query,
    resultType: totalMatches === 0 ? "ZERO_RESULTS" : "MIXED",
    resultCount: totalMatches,
    visitorId,
  });

  if (totalMatches === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-lg mb-2">No matches yet for “{query}”.</p>
        <p className="text-muted mb-6">
          We haven't indexed a DJ set with that track or artist yet. If you know one, help us grow the catalog.
        </p>
        <Link href="/submit" className="px-5 py-2.5 rounded-lg bg-accent text-accent-foreground font-medium">
          Add a DJ set
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-xl font-medium mb-8">Results for “{query}”</h1>

      {result.trackMatches.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-wide text-muted mb-3">Tracks</h2>
          <ul className="space-y-1">
            {result.trackMatches.slice(0, 8).map((t) => (
              <li key={t.id}>
                <Link href={`/track/${t.slug}`} className="block rounded-lg px-4 py-3 bg-card hover:ring-1 ring-accent transition">
                  <span className="font-medium">{t.title}</span>
                  {t.artistNames.length > 0 && <span className="text-muted"> — {t.artistNames.join(", ")}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.artistMatches.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-wide text-muted mb-3">Artists</h2>
          <ul className="space-y-1">
            {result.artistMatches.slice(0, 8).map((a) => (
              <li key={a.id}>
                <Link href={`/artist/${a.slug}`} className="block rounded-lg px-4 py-3 bg-card hover:ring-1 ring-accent transition font-medium">
                  {a.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.djMatches.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-muted mb-3">DJs</h2>
          <ul className="space-y-1">
            {result.djMatches.slice(0, 8).map((d) => (
              <li key={d.id}>
                <Link href={`/dj/${d.slug}`} className="block rounded-lg px-4 py-3 bg-card hover:ring-1 ring-accent transition font-medium">
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
