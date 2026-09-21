import Link from "next/link";
import { getOverviewStats, getSourceHealth } from "@/lib/admin/stats";
import { triggerIngestion } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin overview", robots: { index: false } };

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const stats = await getOverviewStats();
  const sources = await getSourceHealth();

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-lg font-medium mb-4">Overview</h1>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total sets" value={stats.totalSets} />
          <StatCard label="Total tracks" value={stats.totalTracks} />
          <StatCard label="Total artists" value={stats.totalArtists} />
          <StatCard label="Track appearances" value={stats.totalAppearances} />
          <StatCard label="Discovered (7d)" value={stats.recentlyDiscovered} />
          <StatCard label="Successfully processed" value={stats.processed} />
          <StatCard label="Failed imports" value={stats.failedSets.length} />
          <StatCard label="Pending review" value={stats.pendingReviewCount} />
          <StatCard label="Pending submissions" value={stats.pendingSubmissionsCount} />
          <StatCard label="Duplicate candidates" value={stats.duplicateCandidates.length} />
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-muted mb-3">Source health</h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card text-muted text-left">
              <tr>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Sets indexed</th>
                <th className="px-4 py-2">Last run</th>
                <th className="px-4 py-2">Last result</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sources.map(({ platform, lastRun, setCount }) => (
                <tr key={platform.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{platform.name}</td>
                  <td className="px-4 py-2">{setCount}</td>
                  <td className="px-4 py-2 text-muted">
                    {lastRun ? new Date(lastRun.startedAt).toLocaleString() : "never run"}
                  </td>
                  <td className="px-4 py-2">
                    {lastRun ? (
                      <span
                        className={
                          lastRun.status === "SUCCEEDED"
                            ? "text-accent"
                            : lastRun.status === "FAILED"
                            ? "text-red-400"
                            : "text-muted"
                        }
                      >
                        {lastRun.status} ({lastRun.setsCreated} new, {lastRun.setsFailed} failed)
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={triggerIngestion}>
                      <input type="hidden" name="adapterKey" value={platform.adapterKey} />
                      <button type="submit" className="text-xs px-2.5 py-1 rounded-md border border-border hover:border-accent">
                        Run now
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-muted mb-3">Failed imports</h2>
        {stats.failedSets.length === 0 ? (
          <p className="text-sm text-muted">None right now.</p>
        ) : (
          <ul className="space-y-2">
            {stats.failedSets.map((s) => (
              <li key={s.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <Link href={`/set/${s.slug}`} className="font-medium hover:underline">{s.title}</Link>
                <p className="text-muted mt-1">{s.importError}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-muted mb-3">Duplicate candidates</h2>
        {stats.duplicateCandidates.length === 0 ? (
          <p className="text-sm text-muted">None detected.</p>
        ) : (
          <ul className="space-y-2">
            {stats.duplicateCandidates.map((d, i) => (
              <li key={i} className="rounded-lg border border-border bg-card p-3 text-sm">
                <span className="font-medium">{d.title}</span> — {d.count} sets with matching titles on the same platform:{" "}
                {d.slugs.map((slug: string, j: number) => (
                  <span key={slug}>
                    {j > 0 && ", "}
                    <Link href={`/set/${slug}`} className="underline">{slug}</Link>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
