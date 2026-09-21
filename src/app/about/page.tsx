export const metadata = { title: "About & sources" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">About</h1>
      <div className="space-y-4 text-muted">
        <p>
          This is a search engine for what's <em>inside</em> DJ sets. Instead of starting
          from a mix and reading its tracklist, start from a track or artist you like and
          find the sets that play it.
        </p>
        <p>
          Tracklists are pulled from each source platform's own public API — nothing is
          scraped from pages that don't offer one. Every set on this site links back to
          where it came from, and every automatic artist/track match carries a confidence
          score; anything uncertain is held for review rather than guessed at.
        </p>
        <p>
          The catalog grows on a schedule as new sets are discovered from approved
          sources, and anyone can speed that up by submitting a set URL directly.
        </p>
      </div>
    </div>
  );
}
