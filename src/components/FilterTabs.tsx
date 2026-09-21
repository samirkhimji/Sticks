import Link from "next/link";

const FILTERS: { key: string; label: string }[] = [
  { key: "top", label: "Top matches" },
  { key: "recent", label: "Recent" },
  { key: "long", label: "Long sets" },
  { key: "festival", label: "Festival" },
  { key: "radio", label: "Radio / Studio" },
];

export function FilterTabs({ basePath, active }: { basePath: string; active: string }) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {FILTERS.map((f) => (
        <Link
          key={f.key}
          href={f.key === "top" ? basePath : `${basePath}?filter=${f.key}`}
          className={`text-sm px-3 py-1.5 rounded-full border transition ${
            active === f.key
              ? "bg-accent text-accent-foreground border-accent"
              : "border-border text-muted hover:text-foreground hover:border-foreground/40"
          }`}
        >
          {f.label}
        </Link>
      ))}
    </div>
  );
}
