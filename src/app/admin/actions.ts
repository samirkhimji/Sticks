"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { clearAdminCookie } from "@/lib/adminAuth";
import { runIngestion } from "@/lib/ingestion/pipeline";
import { forceCreateArtist, forceCreateTrack, forceCreateDj } from "@/lib/normalize/resolve";

export async function logout() {
  await clearAdminCookie();
  redirect("/admin/login");
}

export async function triggerIngestion(formData: FormData) {
  const adapterKey = String(formData.get("adapterKey") ?? "");
  if (adapterKey) {
    await runIngestion(adapterKey, { trigger: "MANUAL", limit: 20 });
  }
  revalidatePath("/admin");
  revalidatePath("/admin/sources");
}

/**
 * Resolve a review-queue item: "approve" confirms the suggested candidate
 * match; "reject" confirms the raw text is genuinely a *different* entity
 * and creates a new canonical row for it. Either way a human decision now
 * exists, so the appearance moves out of NEEDS_REVIEW.
 */
export async function resolveReviewItem(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "");
  const decision = String(formData.get("decision") ?? ""); // "approve" | "reject"

  const [item] = await db.select().from(schema.reviewQueueItems).where(eq(schema.reviewQueueItems.id, itemId)).limit(1);
  if (!item) return;

  const details = item.details as any;
  const appearanceId: string | undefined = details.appearanceId;

  if (appearanceId) {
    if (item.type === "ARTIST_MATCH") {
      const artistId = decision === "approve"
        ? details.candidateArtistId
        : await forceCreateArtist(details.rawName);
      await db
        .update(schema.trackAppearances)
        .set({ matchedArtistId: artistId, matchStatus: "AUTO_MATCHED", matchConfidence: 1 })
        .where(eq(schema.trackAppearances.id, appearanceId));
    } else if (item.type === "TRACK_MATCH") {
      const trackId = decision === "approve"
        ? details.candidateTrackId
        : await forceCreateTrack(details.rawTitle, null);
      await db
        .update(schema.trackAppearances)
        .set({ trackId, matchStatus: "AUTO_MATCHED", matchConfidence: 1 })
        .where(eq(schema.trackAppearances.id, appearanceId));
    } else if (item.type === "DJ_MATCH") {
      const djId = decision === "approve"
        ? details.candidateDjId
        : await forceCreateDj(details.rawName);
      if (djId) {
        const [appearance] = await db
          .select({ setId: schema.trackAppearances.setId })
          .from(schema.trackAppearances)
          .where(eq(schema.trackAppearances.id, appearanceId))
          .limit(1);
        if (appearance) {
          await db.insert(schema.setDjs).values({ setId: appearance.setId, djId }).onConflictDoNothing();
        }
      }
    }
  }

  await db
    .update(schema.reviewQueueItems)
    .set({
      status: decision === "approve" ? "APPROVED" : "REJECTED",
      resolvedAt: new Date(),
    })
    .where(eq(schema.reviewQueueItems.id, itemId));

  revalidatePath("/admin/review");
  revalidatePath("/admin");
}
