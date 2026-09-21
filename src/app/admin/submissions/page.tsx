import Link from "next/link";
import { getSubmissions } from "@/lib/admin/stats";

export const dynamic = "force-dynamic";
export const metadata = { title: "Submissions", robots: { index: false } };

export default async function AdminSubmissionsPage() {
  const submissions = await getSubmissions();

  return (
    <div>
      <h1 className="text-lg font-medium mb-6">User submissions</h1>
      {submissions.length === 0 ? (
        <p className="text-sm text-muted">None yet.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card text-muted text-left">
              <tr>
                <th className="px-4 py-2">URL</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Submitted</th>
                <th className="px-4 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-2 max-w-xs truncate">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{s.url}</a>
                  </td>
                  <td className="px-4 py-2">{s.status}</td>
                  <td className="px-4 py-2 text-muted">{new Date(s.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2 text-muted">
                    {s.resultSetId && <Link href={`/set/${s.resultSetId}`} className="underline">view set</Link>}
                    {s.rejectionReason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
