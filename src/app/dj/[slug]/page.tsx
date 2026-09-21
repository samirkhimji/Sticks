import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDjBySlug } from "@/lib/search/catalog";
import { formatYear, formatDuration } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const dj = await getDjBySlug(slug);
  if (!dj) return {};
  return {
    title: `${dj.name} — indexed DJ sets`,
    description: `Sets by ${dj.name} with a searchable, timestamped tracklist.`,
    alternates: { canonical: `/dj/${dj.slug}` },
  };
}

export default async function DjPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dj = await getDjBySlug(slug);
  if (!dj) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-2 text-sm text-muted">
        <Link href="/" className="hover:underline">Search</Link> / DJ
      </div>
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-6">{dj.name}</h1>

      {dj.sets.length === 0 ? (
        <p className="text-muted">No processed sets indexed for this DJ yet.</p>
      ) : (
        <ul className="space-y-2">
          {dj.sets.map((s) => (
            <li key={s.id}>
              <Link href={`/set/${s.slug}`} className="block rounded-xl border border-border bg-card p-4 hover:ring-1 ring-accent transition">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{s.title}</span>
                  <span className="text-xs text-muted shrink-0">{formatYear(s.publishedAt, s.yearKnown)}</span>
                </div>
                <div className="text-sm text-muted mt-1">
                  {s.eventName && <span>{s.eventName} · </span>}
                  {s.sourcePlatformName}
                  {s.durationSec ? ` · ${formatDuration(s.durationSec)}` : ""}
                  {s.isDemoFixture && <span> · demo fixture</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
