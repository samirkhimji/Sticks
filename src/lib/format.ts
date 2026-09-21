export function formatTimestamp(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatYear(publishedAt: Date | string | null | undefined, yearKnown: number | null | undefined): string {
  if (publishedAt) return new Date(publishedAt).getFullYear().toString();
  if (yearKnown) return String(yearKnown);
  return "date unknown";
}

export function formatDate(publishedAt: Date | string | null | undefined): string | null {
  if (!publishedAt) return null;
  return new Date(publishedAt).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}
