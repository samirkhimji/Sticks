import Link from "next/link";
import { logout } from "./actions";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/review", label: "Review queue" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="text-sm px-3 py-1.5 rounded-lg hover:bg-card text-muted hover:text-foreground">
              {t.label}
            </Link>
          ))}
        </nav>
        <form action={logout}>
          <button type="submit" className="text-sm text-muted hover:text-foreground">Sign out</button>
        </form>
      </div>
      {children}
    </div>
  );
}
