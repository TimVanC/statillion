import { NextRequest, NextResponse } from "next/server";
import { answerPopularity } from "@/lib/game";
import { handleApiError } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";

/** How many players gave each answer for a prompt. */
export async function GET(req: NextRequest) {
  const promptId = req.nextUrl.searchParams.get("promptId");
  if (!promptId) {
    return NextResponse.json({ error: "missing-prompt-id" }, { status: 400 });
  }
  try {
    const counts = await answerPopularity(promptId);
    return NextResponse.json({ counts });
  } catch (err) {
    return handleApiError(err);
  }
}
