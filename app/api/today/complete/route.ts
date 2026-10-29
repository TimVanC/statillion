import { NextRequest, NextResponse } from "next/server";
import { completeRun } from "@/lib/game";
import { handleApiError } from "@/lib/apiErrors";
import { pointsToMeters, scoreBand } from "@/lib/scoring";
import type { CompleteResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Marks the run complete and returns totals plus today's percentile. */
export async function POST(req: NextRequest) {
  let body: { runId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }
  if (!body.runId) {
    return NextResponse.json({ error: "missing-run-id" }, { status: 400 });
  }

  try {
    const { run, playersToday, percentile } = await completeRun(body.runId);
    const response: CompleteResponse = {
      totalPoints: run.total_points,
      totalMeters: pointsToMeters(run.total_points),
      band: scoreBand(run.total_points),
      percentile,
      playersToday,
    };
    return NextResponse.json(response);
  } catch (err) {
    return handleApiError(err);
  }
}
