// Demo/fixture adapter — used only in this sandbox, where outbound access to
// real source platforms is blocked. It reads locally-stored JSON files
// shaped exactly like real Mixcloud API responses (see fixtures/mixcloud/)
// and runs them through the *same* parsing function the live Mixcloud
// adapter uses (`parseCloudcastPayload`) — the only thing being swapped out
// is the transport (local file vs. HTTP fetch), not the ingestion logic.
//
// Every set this adapter produces is flagged `isDemoFixture: true`, which
// the DB, the UI and the admin dashboard all surface honestly as unverified
// sandbox data rather than confirmed real-world content. Once deployed
// somewhere with normal internet access, disable/ignore this adapter and
// rely on the real ones (mixcloud, youtube, ...).

import { readdirSync, readFileSync } from "fs";
import path from "path";
import type { DiscoveredSet, SourceAdapter } from "../types";
import { cloudcastToDiscoveredSet, parseCloudcastPayload, type MixcloudCloudcast } from "./mixcloud";

const FIXTURES_DIR = path.join(process.cwd(), "src/lib/ingestion/fixtures/mixcloud");

function loadFixtures(): MixcloudCloudcast[] {
  let files: string[] = [];
  try {
    files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(FIXTURES_DIR, f), "utf-8")) as MixcloudCloudcast);
}

export const demoFixtureAdapter: SourceAdapter = {
  adapterKey: "demo_fixture",
  platformKey: "demo_fixture",
  platformName: "Demo Fixtures (sandbox only)",
  baseUrl: "https://demo.diggr.local",
  supportsTimestampLinks: false, // no real audio behind these — see UI badge

  isEnabled() {
    return true;
  },

  async discoverNew(limit) {
    return loadFixtures()
      .slice(0, limit)
      .map((c) => ({ ...cloudcastToDiscoveredSet(c), isDemoFixture: true }) as DiscoveredSet);
  },

  async fetchByUrl(url) {
    const match = loadFixtures().find((c) => c.url === url);
    return match ? ({ ...cloudcastToDiscoveredSet(match), isDemoFixture: true } as DiscoveredSet) : null;
  },

  async parseTracklist(set) {
    return parseCloudcastPayload(set.rawPayload as MixcloudCloudcast);
  },

  buildTimestampUrl() {
    return null; // deliberately: there is no real audio to deep-link into
  },
};
