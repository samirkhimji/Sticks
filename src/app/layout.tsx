import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

// Deliberately not using next/font/google here: it requires reaching
// fonts.googleapis.com at build time, which isn't guaranteed in every build
// environment (and this app already has enough of its own privacy-conscious
// design that avoiding an extra external font fetch fits). System fonts
// (defined in globals.css) look good and load instantly with zero requests.

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "Sticks";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — find DJ sets by the tracks inside them`, template: `%s — ${SITE_NAME}` },
  description:
    "Search DJ sets by the track or artist inside them, jump straight to the moment it plays.",
  openGraph: { siteName: SITE_NAME, type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border">
          <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-4">
            <Link href="/" className="font-semibold tracking-tight text-lg">
              {SITE_NAME}
            </Link>
            <nav className="flex items-center gap-5 text-sm text-muted">
              <Link href="/submit" className="hover:text-foreground transition-colors">
                Add a DJ set
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border mt-16">
          <div className="mx-auto max-w-5xl px-4 py-8 text-xs text-muted flex flex-wrap gap-x-6 gap-y-2">
            <span>{SITE_NAME} — a search engine for what's inside DJ sets.</span>
            <Link href="/submit" className="hover:text-foreground">Add a DJ set</Link>
            <Link href="/about" className="hover:text-foreground">About &amp; sources</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
