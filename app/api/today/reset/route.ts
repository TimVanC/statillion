import { NextRequest, NextResponse } from "next/server";
import { resetTodayRun } from "@/lib/game";
import { handleApiError } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";

/** Testing aid: wipes the caller's run for today so it can be replayed. */
export async function POST(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id");
  if (!deviceId || deviceId.length > 64) {
    return NextResponse.json({ error: "missing-device-id" }, { status: 400 });
  }
  try {
    await resetTodayRun(deviceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
