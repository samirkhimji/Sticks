import { login } from "./actions";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <div className="mx-auto max-w-sm px-4 py-24">
      <h1 className="text-xl font-semibold mb-6">Admin</h1>
      <form action={login} className="space-y-3">
        <input type="hidden" name="next" value={next ?? "/admin"} />
        <input
          type="password"
          name="password"
          required
          autoFocus
          placeholder="Password"
          className="w-full rounded-lg border border-border bg-card px-4 py-2.5 outline-none focus:border-accent"
        />
        {error === "config" && (
          <p className="text-sm text-red-400">
            Server misconfigured: ADMIN_PASSWORD and/or SESSION_SECRET aren't set. Set both in your
            deployment&apos;s environment variables and redeploy.
          </p>
        )}
        {error === "1" && <p className="text-sm text-red-400">Wrong password.</p>}
        <button type="submit" className="w-full px-4 py-2.5 rounded-lg bg-accent text-accent-foreground font-medium">
          Sign in
        </button>
      </form>
    </div>
  );
}
