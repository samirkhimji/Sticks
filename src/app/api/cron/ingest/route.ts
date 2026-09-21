// Scheduled ingestion entrypoint. Wire this up to run automatically with
// either:
//   - Vercel Cron (see vercel.json in the project root), or
//   - a GitHub Actions workflow on a schedule (see .github/workflows/ingest.yml)
// hitting this URL with the CRON_SECRET as a bearer token. Either way, the
// actual ingestion logic lives in one place (lib/ingestion/pipeline.ts) —
// this route is just the trigger.

import { NextResponse } from "next/server";
import { runIngestion } from "@/lib/ingestion/pipeline";
import { listAdapters } from "@/lib/ingestion/registry";

export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const only = url.searchParams.get("adapter");

  const adapters = listAdapters().filter((a) => a.adapterKey !== "demo_fixture" && (!only || a.adapterKey === only));

  const results = [];
  for (const adapter of adapters) {
    const summary = await runIngestion(adapter.adapterKey, { trigger: "SCHEDULED", limit: 20 });
    results.push({ adapter: adapter.adapterKey, ...summary });
  }

  return NextResponse.json({ ok: true, results });
}
