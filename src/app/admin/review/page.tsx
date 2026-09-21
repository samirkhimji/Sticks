import { getReviewQueue } from "@/lib/admin/stats";
import { resolveReviewItem } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review queue", robots: { index: false } };

function describe(item: Awaited<ReturnType<typeof getReviewQueue>>[number]) {
  const d = item.details as any;
  if (item.type === "ARTIST_MATCH") {
    return `"${d.rawName}" looks similar to existing artist "${d.candidateName}" (score ${Number(d.score).toFixed(2)})`;
  }
  if (item.type === "TRACK_MATCH") {
    return `"${d.rawTitle}" looks similar to an existing track (score ${Number(d.score).toFixed(2)})`;
  }
  if (item.type === "DJ_MATCH") {
    return `"${d.rawName}" looks similar to existing DJ "${d.candidateName}" (score ${Number(d.score).toFixed(2)})`;
  }
  return item.type;
}

export default async function AdminReviewPage() {
  const items = await getReviewQueue();

  return (
    <div>
      <h1 className="text-lg font-medium mb-1">Review queue</h1>
      <p className="text-sm text-muted mb-6">
        Matches ingestion wasn't confident enough to apply automatically. Approve confirms
        the suggested match; reject creates a new, distinct entity from the raw text.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing pending review.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-4">
              <div className="text-sm">
                <span className="text-xs uppercase text-muted mr-2">{item.type.replace("_", " ")}</span>
                {describe(item)}
              </div>
              <div className="flex gap-2 shrink-0">
                <form action={resolveReviewItem}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <button type="submit" className="text-xs px-3 py-1.5 rounded-md bg-accent text-accent-foreground font-medium">
                    Approve match
                  </button>
                </form>
                <form action={resolveReviewItem}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <button type="submit" className="text-xs px-3 py-1.5 rounded-md border border-border hover:border-accent">
                    Reject — treat as new
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
