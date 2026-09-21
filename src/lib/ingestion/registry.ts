// Central place a new adapter is plugged in. Adding a source platform later
// means: write a file satisfying SourceAdapter, add one line here, add one
// row to source_platforms (ensureSourcePlatforms does this idempotently).
// Nothing else in the pipeline, matching, storage, or admin UI changes.

import type { SourceAdapter } from "./types";
import { mixcloudAdapter } from "./adapters/mixcloud";
import { youtubeAdapter } from "./adapters/youtube";
import { demoFixtureAdapter } from "./adapters/demoFixture";

// SECURITY / DATA-INTEGRITY: the demo_fixture adapter feeds hard-coded fake
// data through the real ingestion pipeline. It exists purely so this project
// can be built and tested without outbound network access. It must never be
// reachable in a real deployment — if it were registered unconditionally, it
// would show up in /admin/sources with a "Run now" button that writes fake
// sets into the production database. It is only included here when an
// operator explicitly opts in for local development.
const DEMO_FIXTURES_ENABLED = process.env.ENABLE_DEMO_FIXTURES === "true";

export const ADAPTERS: Record<string, SourceAdapter> = {
  mixcloud: mixcloudAdapter,
  youtube: youtubeAdapter,
  ...(DEMO_FIXTURES_ENABLED ? { demo_fixture: demoFixtureAdapter } : {}),
};

export function getAdapter(key: string): SourceAdapter | null {
  return ADAPTERS[key] ?? null;
}

export function listAdapters(): SourceAdapter[] {
  return Object.values(ADAPTERS);
}
