import Link from "next/link";
import { formatTimestamp, formatDuration, formatYear } from "@/lib/format";
import type { ScoredAppearance } from "@/lib/search/rank";

export function ResultCard({ row }: { row: ScoredAppearance }) {
  return (
    <li className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {row.djs.length > 0 ? (
              row.djs.map((dj, i) => (
                <span key={dj.id}>
                  {i > 0 && <span className="text-muted"> b2b </span>}
                  <Link href={`/dj/${dj.slug}`} className="font-medium hover:text-accent">
                    {dj.name}
                  </Link>
                </span>
              ))
            ) : (
              <span className="font-medium text-muted">Unknown DJ</span>
            )}
          </div>
          <Link href={`/set/${row.setSlug}`} className="block text-sm text-muted hover:text-foreground truncate">
            {row.setTitle}
            {row.eventName && (
              <>
                {" "}
                ·{" "}
                <Link href={`/event/${row.eventSlug}`} className="hover:underline">
                  {row.eventName}
                </Link>
              </>
            )}
          </Link>
        </div>
        <div className="text-right shrink-0 text-xs text-muted space-y-0.5">
          <div>{formatYear(row.publishedAt, row.yearKnown)}</div>
          {row.durationSec && <div>{formatDuration(row.durationSec)}</div>}
          <div>{row.sourcePlatformName}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/60">
        <div className="flex items-center gap-2 text-sm">
          <span className="timestamp text-accent">{formatTimestamp(row.timestampSec)}</span>
          {row.timestampConfidence === "APPROXIMATE" && (
            <span className="text-xs text-muted">(approx.)</span>
          )}
          {row.isDemoFixture && (
            <span className="text-xs rounded-full border border-border px-2 py-0.5 text-muted">
              demo fixture — unverified
            </span>
          )}
        </div>
        {row.playUrl ? (
          <a
            href={`/go/play/${row.appearanceId}`}
            className="text-sm px-3 py-1.5 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90"
          >
            Play from here →
          </a>
        ) : (
          <Link href={`/set/${row.setSlug}`} className="text-sm px-3 py-1.5 rounded-lg border border-border hover:border-accent">
            View set
          </Link>
        )}
      </div>
    </li>
  );
}
