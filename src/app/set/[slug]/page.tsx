import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSetBySlug, incrementSetView } from "@/lib/search/catalog";
import { formatTimestamp, formatDuration, formatYear, formatDate } from "@/lib/format";
import { logPageView, getOrCreateVisitorId, getRefererHeader } from "@/lib/analytics";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const set = await getSetBySlug(slug);
  if (!set) return {};
  const djNames = set.djs.map((d) => d.name).join(" b2b ");
  return {
    title: `${djNames ? `${djNames} — ` : ""}${set.title}`,
    description: `Timestamped tracklist for ${set.title}${djNames ? ` by ${djNames}` : ""}${set.event ? ` at ${set.event.name}` : ""}.`,
    alternates: { canonical: `/set/${set.slug}` },
  };
}

export default async function SetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const set = await getSetBySlug(slug);
  if (!set) notFound();

  incrementSetView(set.id).catch(() => {});
  getOrCreateVisitorId()
    .then(async (visitorId) => logPageView({ path: `/set/${slug}`, visitorId, referrer: await getRefererHeader() }))
    .catch(() => {});

  const djNames = set.djs.map((d) => d.name).join(" b2b ");
  const matchedAppearances = set.appearances.filter((a) => a.matchStatus === "AUTO_MATCHED");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicPlaylist",
    name: set.title,
    numTracks: matchedAppearances.length,
    byArtist: set.djs.map((d) => ({ "@type": "MusicGroup", name: d.name })),
    datePublished: set.publishedAt ? new Date(set.publishedAt).toISOString() : undefined,
    track: matchedAppearances
      .filter((a) => a.trackTitle)
      .map((a) => ({
        "@type": "MusicRecording",
        name: a.trackTitle,
        byArtist: a.artistName ? { "@type": "MusicGroup", name: a.artistName } : undefined,
      })),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mb-2 text-sm text-muted">
        <Link href="/" className="hover:underline">Search</Link> / Set
      </div>

      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-1">{set.title}</h1>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted mb-1">
        {set.djs.map((d, i) => (
          <span key={d.id}>
            {i > 0 && " b2b "}
            <Link href={`/dj/${d.slug}`} className="hover:text-foreground hover:underline">{d.name}</Link>
          </span>
        ))}
      </div>
      <p className="text-sm text-muted mb-6">
        {set.event && (
          <>
            <Link href={`/event/${set.event.slug}`} className="hover:underline">{set.event.name}</Link>
            {" · "}
          </>
        )}
        {formatDate(set.publishedAt) ?? formatYear(set.publishedAt, set.yearKnown)}
        {set.durationSec ? ` · ${formatDuration(set.durationSec)}` : ""}
        {" · "}
        {set.platform?.name}
        {set.isDemoFixture && (
          <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs">
            demo fixture — unverified sandbox data
          </span>
        )}
      </p>

      {set.embedUrl && !set.isDemoFixture ? (
        <div className="mb-8 rounded-xl overflow-hidden border border-border">
          <iframe
            src={set.embedUrl}
            className="w-full border-0"
            height={120}
            title={set.title}
            allow="autoplay"
          />
        </div>
      ) : (
        <div className="mb-8 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
          {set.isDemoFixture
            ? "This is sandbox demo data used to test the ingestion pipeline — there's no real audio behind it."
            : "No embeddable player available for this source."}{" "}
          <a href={set.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
            View original →
          </a>
        </div>
      )}

      <h2 className="text-sm uppercase tracking-wide text-muted mb-3">Tracklist</h2>
      {set.appearances.length === 0 ? (
        <p className="text-muted text-sm">No tracklist available for this set yet.</p>
      ) : (
        <ol className="divide-y divide-border rounded-xl border border-border overflow-hidden">
          {set.appearances.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3 bg-card">
              <span className="timestamp text-accent text-sm w-16 shrink-0">{formatTimestamp(a.timestampSec)}</span>
              <div className="min-w-0 flex-1">
                {a.artistSlug ? (
                  <Link href={`/artist/${a.artistSlug}`} className="hover:underline">
                    {a.artistName ?? a.rawArtistText}
                  </Link>
                ) : (
                  <span>{a.rawArtistText}</span>
                )}
                {" — "}
                {a.trackSlug ? (
                  <Link href={`/track/${a.trackSlug}`} className="hover:underline font-medium">
                    {a.trackTitle ?? a.rawTitleText}
                  </Link>
                ) : (
                  <span className="font-medium">{a.rawTitleText}</span>
                )}
                {a.matchStatus === "NEEDS_REVIEW" && (
                  <span className="ml-2 text-xs text-muted">(unconfirmed match)</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
