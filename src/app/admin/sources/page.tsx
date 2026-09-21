import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { listAdapters } from "@/lib/ingestion/registry";
import { WATCHED_MIXCLOUD_USERS } from "@/lib/ingestion/sources.config";
import { triggerIngestion } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sources", robots: { index: false } };

export default async function AdminSourcesPage() {
  const adapters = listAdapters();
  const recentRuns = await db
    .select()
    .from(schema.ingestionRuns)
    .orderBy(desc(schema.ingestionRuns.startedAt))
    .limit(20);
  const platforms = await db.select().from(schema.sourcePlatforms);
  const platformById = new Map(platforms.map((p) => [p.id, p]));

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-lg font-medium mb-4">Adapters</h1>
        <ul className="space-y-3">
          {adapters.map((a) => (
            <li key={a.adapterKey} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{a.platformName}</div>
                  <div className="text-xs text-muted">
                    {a.isEnabled() ? "enabled" : `disabled — ${a.disabledReason?.() ?? "unknown reason"}`}
                  </div>
                </div>
                <form action={triggerIngestion}>
                  <input type="hidden" name="adapterKey" value={a.adapterKey} />
                  <button type="submit" className="text-xs px-3 py-1.5 rounded-md border border-border hover:border-accent">
                    Run now
                  </button>
                </form>
              </div>
              {a.adapterKey === "mixcloud" && (
                <p className="text-xs text-muted mt-2">Watching: {WATCHED_MIXCLOUD_USERS.join(", ")}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-muted mb-3">Recent ingestion runs</h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card text-muted text-left">
              <tr>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Trigger</th>
                <th className="px-4 py-2">Started</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Discovered / Created / Failed</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2">{platformById.get(r.sourcePlatformId)?.name ?? "?"}</td>
                  <td className="px-4 py-2 text-muted">{r.trigger}</td>
                  <td className="px-4 py-2 text-muted">{new Date(r.startedAt).toLocaleString()}</td>
                  <td className="px-4 py-2">{r.status}</td>
                  <td className="px-4 py-2">{r.setsDiscovered} / {r.setsCreated} / {r.setsFailed}</td>
                </tr>
              ))}
              {recentRuns.length === 0 && (
                <tr><td className="px-4 py-3 text-muted" colSpan={5}>No runs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
