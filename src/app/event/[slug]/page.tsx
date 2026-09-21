import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/search/catalog";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return {};
  return {
    title: `${event.name}${event.year ? ` ${event.year}` : ""} — sets indexed`,
    description: `DJ sets from ${event.name} with searchable, timestamped tracklists.`,
    alternates: { canonical: `/event/${event.slug}` },
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-2 text-sm text-muted">
        <Link href="/" className="hover:underline">Search</Link> / Event
      </div>
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-1">
        {event.name}
        {event.year ? ` ${event.year}` : ""}
      </h1>
      <p className="text-muted mb-6 text-sm">{event.type.replace("_", " ").toLowerCase()}</p>

      <ul className="space-y-2">
        {event.sets.map((s) => (
          <li key={s.id}>
            <Link href={`/set/${s.slug}`} className="block rounded-xl border border-border bg-card p-4 hover:ring-1 ring-accent transition">
              <span className="font-medium">{s.title}</span>
              <span className="text-sm text-muted ml-2">{s.sourcePlatformName}{s.isDemoFixture ? " · demo fixture" : ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
