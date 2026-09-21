"use server";

import { redirect } from "next/navigation";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { processSubmissionUrl } from "@/lib/ingestion/pipeline";

function hashIp(ip: string) {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

const STATUS_MAP = {
  processed: "PROCESSED",
  duplicate: "DUPLICATE",
  queued: "QUEUED",
  rejected: "REJECTED",
} as const;

export async function submitSetUrl(formData: FormData) {
  const url = String(formData.get("url") ?? "").trim();

  if (!url || !/^https?:\/\//i.test(url)) {
    redirect(`/submit/result?status=invalid`);
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const [submission] = await db
    .insert(schema.userSubmissions)
    .values({ url, status: "VALIDATING", submitterIpHash: hashIp(ip) })
    .returning();

  let outcome: Awaited<ReturnType<typeof processSubmissionUrl>>;
  try {
    outcome = await processSubmissionUrl(url);
  } catch (err) {
    outcome = { status: "rejected", reason: String((err as Error)?.message ?? err) };
  }

  await db
    .update(schema.userSubmissions)
    .set({
      status: STATUS_MAP[outcome.status],
      rejectionReason: outcome.reason,
      resultSetId: outcome.setSlug,
      processedAt: new Date(),
    })
    .where(eq(schema.userSubmissions.id, submission.id));

  const qs = new URLSearchParams({ status: outcome.status });
  if (outcome.setSlug) qs.set("slug", outcome.setSlug);
  if (outcome.reason) qs.set("reason", outcome.reason);
  redirect(`/submit/result?${qs.toString()}`);
}
