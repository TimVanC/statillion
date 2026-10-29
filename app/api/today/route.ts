import { NextRequest, NextResponse } from "next/server";
import { getOrCreateRun } from "@/lib/game";
import { handleApiError } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";

/** Returns today's prompts (text only) and the caller's run state. */
export async function GET(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id");
  if (!deviceId || deviceId.length > 64) {
    return NextResponse.json({ error: "missing-device-id" }, { status: 400 });
  }
  try {
    const state = await getOrCreateRun(deviceId);
    return NextResponse.json(state);
  } catch (err) {
    return handleApiError(err);
  }
}
