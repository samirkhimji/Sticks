import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-24 pb-16 flex flex-col items-center text-center">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
        Find DJ sets by the track inside them
      </h1>
      <p className="text-muted mb-10 max-w-md">
        Search a track or artist. We'll show you which DJ sets play it, and take you
        straight to the moment it drops.
      </p>

      <form action="/search" method="GET" className="w-full">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 focus-within:border-accent transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-muted shrink-0">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            name="q"
            autoFocus
            placeholder="Find DJ sets containing a track or artist…"
            className="w-full bg-transparent outline-none placeholder:text-muted text-base sm:text-lg"
          />
        </div>
        <button
          type="submit"
          className="mt-4 w-full sm:w-auto px-6 py-2.5 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90 transition-opacity"
        >
          Search
        </button>
      </form>

      <div className="mt-10 text-sm text-muted">
        Try{" "}
        <Link href="/search?q=Standby" className="underline underline-offset-2 hover:text-foreground">
          Standby
        </Link>{" "}
        or{" "}
        <Link href="/search?q=OMFO" className="underline underline-offset-2 hover:text-foreground">
          OMFO
        </Link>
      </div>
    </div>
  );
}
