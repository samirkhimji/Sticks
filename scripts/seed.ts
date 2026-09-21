// Seeds the database for local development/demo purposes.
//
// This does two things:
//  1. Curates a small set of known artist aliases (source: MANUAL) that
//     string-similarity matching cannot discover on its own — e.g. "OMFO"
//     and "Our Man From Odessa" share no characters in common, so no
//     trigram/edit-distance metric will ever connect them. In production,
//     MusicBrainz's alias data fills this gap automatically (see
//     lib/normalize/musicbrainz.ts); this sandbox has no outbound access to
//     MusicBrainz, so the same fact is entered by hand here, exactly the way
//     an admin could do via a future "add alias" admin action.
//  2. Runs the demo_fixture ingestion adapter, which feeds locally-stored
//     fixture data through the *real* Mixcloud parsing/normalization/
//     matching pipeline (lib/ingestion/pipeline.ts) — the same code path
//     that runs against live Mixcloud data in a normal deployment.
//
// Run with: npm run seed

import "dotenv/config";
import { db, schema } from "../src/db";
import { eq } from "drizzle-orm";
import { normalizeText } from "../src/lib/normalize/text";
import { ensureAllSourcePlatforms, runIngestion } from "../src/lib/ingestion/pipeline";
import { resolveArtist } from "../src/lib/normalize/resolve";

async function seedCuratedAliases() {
  // Creates the OMFO artist row if it doesn't exist yet (idempotent), then
  // attaches the aliases a human/MusicBrainz would confirm.
  const omfo = await resolveArtist("OMFO");
  if (!omfo.entityId) throw new Error("Failed to resolve/create OMFO artist");

  const aliases = ["O.M.F.O.", "Our Man From Odessa"];
  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    await db
      .insert(schema.artistAliases)
      .values({ artistId: omfo.entityId, alias, normalizedAlias, source: "MANUAL", confidence: 1 })
      .onConflictDoNothing();
  }
  console.log(`Seeded curated aliases for OMFO (${omfo.entityId}): ${aliases.join(", ")}`);
}

async function main() {
  console.log("Ensuring source platforms exist...");
  await ensureAllSourcePlatforms();

  console.log("Seeding curated artist aliases (standing in for offline MusicBrainz lookups)...");
  await seedCuratedAliases();

  console.log("Running demo_fixture ingestion (sandbox-only; real deployments use mixcloud/youtube instead)...");
  const summary = await runIngestion("demo_fixture", { trigger: "MANUAL", limit: 50 });
  console.log("Ingestion summary:", summary);

  console.log("\nDone. Try:");
  console.log("  npm run dev");
  console.log("  then search 'Our Man From Odessa' or 'OMFO' at http://localhost:3000");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
