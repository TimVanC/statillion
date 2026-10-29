import { NextRequest, NextResponse } from "next/server";
import { revealAnswers } from "@/lib/game";
import { handleApiError } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";

/** Full answer lists and gems; only served after the run is complete. */
export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) {
    return NextResponse.json({ error: "missing-run-id" }, { status: 400 });
  }
  try {
    const prompts = await revealAnswers(runId);
    return NextResponse.json({ prompts });
  } catch (err) {
    return handleApiError(err);
  }
}
