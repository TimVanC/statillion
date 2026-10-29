import { NextRequest, NextResponse } from "next/server";
import { startPrompt, submitGuess } from "@/lib/game";
import { handleApiError } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";

/**
 * Submits a guess for the caller's current prompt. The server runs the
 * fuzzy match and returns a tier, a "Did you mean?" correction, or a
 * rejection. action "start" instead marks the prompt clock as started.
 */
export async function POST(req: NextRequest) {
  let body: {
    runId?: string;
    position?: number;
    guess?: string;
    accept?: boolean;
    timeout?: boolean;
    action?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }

  if (!body.runId || typeof body.runId !== "string") {
    return NextResponse.json({ error: "missing-run-id" }, { status: 400 });
  }

  try {
    if (body.action === "start") {
      await startPrompt(body.runId);
      return NextResponse.json({ ok: true });
    }
    if (typeof body.position !== "number") {
      return NextResponse.json({ error: "missing-position" }, { status: 400 });
    }
    const response = await submitGuess({
      runId: body.runId,
      position: body.position,
      guess: typeof body.guess === "string" ? body.guess : undefined,
      accept: body.accept === true,
      timeout: body.timeout === true,
    });
    return NextResponse.json(response);
  } catch (err) {
    return handleApiError(err);
  }
}
