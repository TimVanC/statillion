import { NextResponse } from "next/server";
import { NoDailySetError, RunStateError } from "./game";

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof NoDailySetError) {
    return NextResponse.json(
      { error: "no-daily-set", message: "No prompts are loaded for today yet." },
      { status: 503 }
    );
  }
  if (err instanceof RunStateError) {
    return NextResponse.json(
      { error: "run-state", message: err.message },
      { status: 409 }
    );
  }
  console.error(err);
  return NextResponse.json(
    { error: "internal", message: "Something went wrong." },
    { status: 500 }
  );
}
