import { submitSetUrl } from "./actions";

export const metadata = { title: "Add a DJ set" };

export default function SubmitPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Add a DJ set</h1>
      <p className="text-muted mb-8">
        Paste a link to a Mixcloud (or YouTube, if enabled) set. We'll check it isn't
        already indexed, pull whatever tracklist information the platform makes
        available, and add it to the catalog automatically — no manual entry needed.
      </p>

      <form action={submitSetUrl} className="space-y-4">
        <input
          type="url"
          name="url"
          required
          placeholder="https://www.mixcloud.com/artist/set-name/"
          className="w-full rounded-lg border border-border bg-card px-4 py-3 outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="px-6 py-2.5 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90"
        >
          Submit
        </button>
      </form>

      <div className="mt-10 text-sm text-muted space-y-2">
        <p>Currently supported: Mixcloud. YouTube support turns on automatically once an API key is configured.</p>
        <p>We only use each platform's own public API — nothing is scraped.</p>
      </div>
    </div>
  );
}
