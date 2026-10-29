import type { Tier } from "./scoring";

/** DTOs shared between API routes and the client. Never include answers. */

export interface TodayPrompt {
  position: number;
  promptId: string;
  text: string;
  sport: string;
}

export interface RunStateDto {
  runId: string;
  date: string;
  runNumber: number;
  currentPosition: number;
  totalPoints: number;
  completed: boolean;
  prompts: TodayPrompt[];
  /** Results of prompts already played (for refresh mid-run). */
  played: PlayedPrompt[];
}

export interface PlayedPrompt {
  position: number;
  guess: string;
  answer: string | null;
  tier: Tier | null;
  points: number;
  status: "scored" | "timeout";
}

export type SubmitResponse =
  | {
      result: "scored";
      answer: string;
      tier: Tier;
      tierLabel: string;
      points: number;
      meters: number;
      totalPoints: number;
      nextPosition: number | null;
    }
  | { result: "suggest"; suggestion: string }
  | { result: "reject"; reason: "not-found" | "ambiguous-person" }
  | {
      result: "timeout";
      totalPoints: number;
      nextPosition: number | null;
    };

export interface RevealAnswer {
  answer: string;
  tier: Tier;
  points: number;
  quip: string | null;
  timesGiven: number;
}

export interface RevealPrompt {
  position: number;
  promptId: string;
  text: string;
  answers: RevealAnswer[];
  gems: RevealAnswer[];
}

export interface CompleteResponse {
  totalPoints: number;
  totalMeters: number;
  band: string;
  percentile: number | null;
  playersToday: number;
}
