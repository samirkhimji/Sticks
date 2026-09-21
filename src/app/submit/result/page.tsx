import Link from "next/link";

export const metadata = { title: "Submission result", robots: { index: false } };

const MESSAGES: Record<string, string> = {
  processed: "Added! We pulled its tracklist and it's live now.",
  queued: "Thanks — it's in the queue and will be processed shortly.",
  duplicate: "That set is already in the catalog.",
  rejected: "We couldn't add that one.",
  invalid: "That doesn't look like a valid URL.",
};

export default async function SubmitResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; slug?: string; reason?: string }>;
}) {
  const { status, slug, reason } = await searchParams;
  const message = MESSAGES[status ?? ""] ?? "Submitted.";

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="text-lg mb-2">{message}</p>
      {reason && <p className="text-muted text-sm mb-6">{reason}</p>}
      <div className="flex items-center justify-center gap-4">
        {slug && (
          <Link href={`/set/${slug}`} className="px-5 py-2.5 rounded-lg bg-accent text-accent-foreground font-medium">
            View set
          </Link>
        )}
        <Link href="/submit" className="px-5 py-2.5 rounded-lg border border-border">
          Add another
        </Link>
      </div>
    </div>
  );
}
