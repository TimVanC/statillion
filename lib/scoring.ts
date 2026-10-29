/** Tier names, points, and distances, straight from the PRD. */

export type Tier =
  | "ten_day"
  | "trick_play"
  | "role_player"
  | "all_star"
  | "hall_of_famer"
  | "hail_mary";

export const METERS_PER_POINT = 60;

export const TIERS: Record<
  Tier,
  { label: string; points: number; meters: number }
> = {
  ten_day: { label: "10-Day Contract", points: 10, meters: 600 },
  trick_play: { label: "Trick Play", points: 15, meters: 900 },
  role_player: { label: "Role Player", points: 30, meters: 1800 },
  all_star: { label: "All-Star", points: 60, meters: 3600 },
  hall_of_famer: { label: "Hall of Famer", points: 85, meters: 5100 },
  hail_mary: { label: "Hail Mary", points: 100, meters: 6000 },
};

export const MAX_POINTS = 700;
export const MAX_METERS = 42000;

export const SCORE_BANDS: { min: number; max: number; label: string }[] = [
  { min: 0, max: 150, label: "Warm-up" },
  { min: 151, max: 250, label: "Weekend jogger" },
  { min: 251, max: 350, label: "Varsity" },
  { min: 351, max: 449, label: "Pro" },
  { min: 450, max: Infinity, label: "Marathon legend" },
];

export function scoreBand(points: number): string {
  const band = SCORE_BANDS.find((b) => points >= b.min && points <= b.max);
  return band ? band.label : SCORE_BANDS[0].label;
}

export interface Landmark {
  meters: number;
  name: string;
  flag: string;
}

export const LANDMARKS: Landmark[] = [
  { meters: 100, name: "100m dash", flag: "100M" },
  { meters: 400, name: "One lap", flag: "400M" },
  { meters: 1609, name: "The mile", flag: "1 MI" },
  { meters: 5000, name: "5K", flag: "5K" },
  { meters: 10000, name: "10K", flag: "10K" },
  { meters: 21097, name: "Half marathon", flag: "HALF" },
  { meters: 42195, name: "Marathon", flag: "FULL" },
];

export function pointsToMeters(points: number): number {
  return points * METERS_PER_POINT;
}

/** Tier emoji used on the Copy Result share card. */
export const TIER_EMOJI: Record<Tier, string> = {
  ten_day: "🟫",
  trick_play: "🟪",
  role_player: "🟦",
  all_star: "🟨",
  hall_of_famer: "🟩",
  hail_mary: "💎",
};

export const TIMEOUT_EMOJI = "⬛";

export const PROMPTS_PER_DAY = 7;
export const PROMPT_SECONDS = 25;
