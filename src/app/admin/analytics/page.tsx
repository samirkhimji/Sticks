import { getAnalyticsSummary } from "@/lib/admin/analytics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics", robots: { index: false } };

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  const a = await getAnalyticsSummary();

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-lg font-medium mb-1">Analytics</h1>
        <p className="text-sm text-muted mb-4">Last {a.windowDays} days. First-party only — no third-party trackers.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Visitors" value={a.visitors} />
          <Stat label="Returning visitors" value={a.returningVisitors} />
          <Stat label="Searches" value={a.totalSearches} />
          <Stat label="Zero-result searches" value={a.zeroResultSearches} />
          <Stat label="Page views" value={a.totalViews} />
          <Stat label="Organic search views" value={a.organicViews} />
          <Stat label="Sets submitted" value={a.submittedSets} />
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-muted mb-3">Clicks by type</h2>
        <ul className="text-sm space-y-1">
          {a.clicksByType.map((c) => (
            <li key={c.type} className="flex justify-between rounded-lg bg-card px-3 py-2">
              <span>{c.type.replace("_", " ")}</span>
              <span className="text-muted">{c.count}</span>
            </li>
          ))}
          {a.clicksByType.length === 0 && <li className="text-muted">No clicks recorded yet.</li>}
        </ul>
      </section>

      <div className="grid sm:grid-cols-2 gap-8">
        <section>
          <h2 className="text-sm uppercase tracking-wide text-muted mb-3">Top searches</h2>
          <ol className="text-sm space-y-1">
            {a.topQueries.map((q, i) => (
              <li key={i} className="flex justify-between rounded-lg bg-card px-3 py-2">
                <span>{q.normalized_query}</span>
                <span className="text-muted">{q.count}</span>
              </li>
            ))}
            {a.topQueries.length === 0 && <li className="text-muted">No searches yet.</li>}
          </ol>
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wide text-muted mb-3">
            Zero-result searches <span className="normal-case text-muted">(coverage gaps)</span>
          </h2>
          <ol className="text-sm space-y-1">
            {a.zeroResultQueries.map((q, i) => (
              <li key={i} className="flex justify-between rounded-lg bg-card px-3 py-2">
                <span>{q.normalized_query}</span>
                <span className="text-muted">{q.count}</span>
              </li>
            ))}
            {a.zeroResultQueries.length === 0 && <li className="text-muted">None — good coverage so far.</li>}
          </ol>
        </section>
      </div>
    </div>
  );
}
