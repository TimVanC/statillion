import { neon } from "@neondatabase/serverless";

/**
 * Server-only Neon Postgres client. Never import from client
 * components: answer sets and tiers must never reach the browser
 * before a run is complete.
 */
let cached: ReturnType<typeof neon> | null = null;

export function db(): ReturnType<typeof neon> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL environment variable");
  }
  cached = neon(url);
  return cached;
}
