/** The game day resets at midnight ET. */

const ET = "America/New_York";

/** Launch day; run number 1. */
export const EPOCH_DATE = "2026-11-01";

/** Today's game date as YYYY-MM-DD in ET. */
export function todayET(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

/** 1-based run number for a game date. */
export function runNumber(date: string): number {
  const ms = Date.parse(date + "T00:00:00Z") - Date.parse(EPOCH_DATE + "T00:00:00Z");
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}
