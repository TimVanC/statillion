import { supabaseAdmin } from "./supabase/admin";
import { todayET, runNumber } from "./date";
import { AnswerEntry, buildIndex, matchGuess, MatchIndex } from "./matching/match";
import { PROMPTS_PER_DAY, Tier, TIERS, pointsToMeters } from "./scoring";
import type {
  PlayedPrompt,
  RunStateDto,
  SubmitResponse,
  TodayPrompt,
} from "./types";

/** Submits arriving later than this after prompt start count as timeouts. */
const PROMPT_DEADLINE_MS = 27_000;

interface RunRow {
  id: string;
  device_id: string;
  date: string;
  current_position: number;
  prompt_started_at: string | null;
  total_points: number;
  completed: boolean;
}

interface AnswerRow {
  id: string;
  answer: string;
  aliases: string[];
  is_person: boolean;
  tier: Tier;
  points: number;
  quip: string | null;
}

export async function getTodayPrompts(date: string): Promise<TodayPrompt[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("daily_sets")
    .select("position, prompt_id, prompts ( prompt_text, sport )")
    .eq("date", date)
    .order("position");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const prompt = Array.isArray(row.prompts) ? row.prompts[0] : row.prompts;
    return {
      position: row.position,
      promptId: row.prompt_id,
      text: (prompt as { prompt_text: string }).prompt_text,
      sport: (prompt as { sport: string }).sport,
    };
  });
}

export async function getOrCreateRun(deviceId: string): Promise<RunStateDto> {
  const db = supabaseAdmin();
  const date = todayET();

  const prompts = await getTodayPrompts(date);
  if (prompts.length === 0) {
    throw new NoDailySetError(date);
  }

  await db.from("players").upsert({ device_id: deviceId }).throwOnError();

  let { data: run } = await db
    .from("runs")
    .select("*")
    .eq("device_id", deviceId)
    .eq("date", date)
    .maybeSingle<RunRow>();

  if (!run) {
    const { data: created, error } = await db
      .from("runs")
      .insert({ device_id: deviceId, date })
      .select("*")
      .single<RunRow>();
    if (error) throw error;
    run = created;
  }

  const played = await getPlayedPrompts(run.id);

  return {
    runId: run.id,
    date,
    runNumber: runNumber(date),
    currentPosition: run.current_position,
    totalPoints: run.total_points,
    completed: run.completed,
    prompts,
    played,
  };
}

async function getPlayedPrompts(runId: string): Promise<PlayedPrompt[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("submissions")
    .select("position, guess, status, tier, points, answers ( answer )")
    .eq("run_id", runId)
    .in("status", ["scored", "timeout"])
    .order("position");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const ans = Array.isArray(row.answers) ? row.answers[0] : row.answers;
    return {
      position: row.position,
      guess: row.guess,
      answer: ans ? (ans as { answer: string }).answer : null,
      tier: (row.tier as Tier) ?? null,
      points: row.points,
      status: row.status as "scored" | "timeout",
    };
  });
}

export class NoDailySetError extends Error {
  constructor(date: string) {
    super(`No daily set configured for ${date}`);
    this.name = "NoDailySetError";
  }
}

export class RunStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunStateError";
  }
}

async function loadRun(runId: string): Promise<RunRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle<RunRow>();
  if (error) throw error;
  if (!data) throw new RunStateError("Run not found");
  return data;
}

async function loadAnswers(promptId: string): Promise<AnswerRow[]> {
  const db = supabaseAdmin();
  const pageSize = 1000;
  const all: AnswerRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("answers")
      .select("id, answer, aliases, is_person, tier, points, quip")
      .eq("prompt_id", promptId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...((data ?? []) as AnswerRow[]));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

function toEntries(rows: AnswerRow[]): AnswerEntry[] {
  return rows.map((r) => ({
    id: r.id,
    answer: r.answer,
    aliases: r.aliases ?? [],
    isPerson: r.is_person,
  }));
}

/** Marks the current prompt's clock as started (idempotent). */
export async function startPrompt(runId: string): Promise<void> {
  const db = supabaseAdmin();
  const run = await loadRun(runId);
  if (run.completed) throw new RunStateError("Run already completed");
  await db
    .from("runs")
    .update({ prompt_started_at: new Date().toISOString() })
    .eq("id", runId)
    .throwOnError();
}

async function advanceRun(
  run: RunRow,
  pointsGained: number
): Promise<{ totalPoints: number; nextPosition: number | null }> {
  const db = supabaseAdmin();
  const totalPoints = run.total_points + pointsGained;
  const next = run.current_position + 1;
  const nextPosition = next <= PROMPTS_PER_DAY ? next : null;
  await db
    .from("runs")
    .update({
      total_points: totalPoints,
      current_position: next,
      prompt_started_at: null,
    })
    .eq("id", run.id)
    .throwOnError();
  return { totalPoints, nextPosition };
}

async function recordTimeout(
  run: RunRow,
  promptId: string
): Promise<SubmitResponse> {
  const db = supabaseAdmin();
  await db
    .from("submissions")
    .insert({
      run_id: run.id,
      prompt_id: promptId,
      position: run.current_position,
      guess: "",
      status: "timeout",
      points: 0,
    })
    .throwOnError();
  const { totalPoints, nextPosition } = await advanceRun(run, 0);
  return { result: "timeout", totalPoints, nextPosition };
}

export interface SubmitInput {
  runId: string;
  position: number;
  guess?: string;
  /** True when the player confirmed a "Did you mean?" suggestion. */
  accept?: boolean;
  /** Client reports the clock ran out. */
  timeout?: boolean;
}

export async function submitGuess(input: SubmitInput): Promise<SubmitResponse> {
  const db = supabaseAdmin();
  const run = await loadRun(input.runId);

  if (run.completed) throw new RunStateError("Run already completed");
  if (run.current_position > PROMPTS_PER_DAY) {
    throw new RunStateError("All prompts already played");
  }
  if (input.position !== run.current_position) {
    throw new RunStateError("Position mismatch; refresh the game");
  }

  const prompts = await getTodayPrompts(run.date);
  const prompt = prompts.find((p) => p.position === run.current_position);
  if (!prompt) throw new NoDailySetError(run.date);

  if (input.timeout) {
    return recordTimeout(run, prompt.promptId);
  }

  // Server-side clock: late submits score nothing.
  if (run.prompt_started_at) {
    const elapsed = Date.now() - Date.parse(run.prompt_started_at);
    if (elapsed > PROMPT_DEADLINE_MS) {
      return recordTimeout(run, prompt.promptId);
    }
  }

  const guess = (input.guess ?? "").slice(0, 80);
  if (guess.trim().length === 0) {
    return { result: "reject", reason: "not-found" };
  }

  const rows = await loadAnswers(prompt.promptId);
  const index: MatchIndex = buildIndex(toEntries(rows));
  const match = matchGuess(guess, index);

  if (match.type === "reject") {
    await db
      .from("submissions")
      .insert({
        run_id: run.id,
        prompt_id: prompt.promptId,
        position: run.current_position,
        guess,
        status: "rejected",
        points: 0,
      })
      .throwOnError();
    return { result: "reject", reason: match.reason };
  }

  // A suggestion only scores after the player confirms it.
  if (match.type === "suggest" && !input.accept) {
    return { result: "suggest", suggestion: match.entry.answer };
  }

  const row = rows.find((r) => r.id === match.entry.id)!;
  await db
    .from("submissions")
    .insert({
      run_id: run.id,
      prompt_id: prompt.promptId,
      position: run.current_position,
      guess,
      answer_id: row.id,
      status: "scored",
      tier: row.tier,
      points: row.points,
    })
    .throwOnError();

  const { totalPoints, nextPosition } = await advanceRun(run, row.points);

  return {
    result: "scored",
    answer: row.answer,
    tier: row.tier,
    tierLabel: TIERS[row.tier].label,
    points: row.points,
    meters: pointsToMeters(row.points),
    totalPoints,
    nextPosition,
  };
}

export async function completeRun(runId: string) {
  const db = supabaseAdmin();
  const run = await loadRun(runId);

  if (!run.completed) {
    if (run.current_position <= PROMPTS_PER_DAY) {
      throw new RunStateError("Run still has prompts left");
    }
    await db
      .from("runs")
      .update({ completed: true })
      .eq("id", runId)
      .throwOnError();
  }

  const { count: playersToday } = await db
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("date", run.date)
    .eq("completed", true)
    .throwOnError();

  const { count: beaten } = await db
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("date", run.date)
    .eq("completed", true)
    .lt("total_points", run.total_points)
    .throwOnError();

  const total = playersToday ?? 0;
  const percentile =
    total > 1 ? Math.round(((beaten ?? 0) / (total - 1)) * 100) : null;

  return { run, playersToday: total, percentile };
}

export async function revealAnswers(runId: string) {
  const db = supabaseAdmin();
  const run = await loadRun(runId);
  if (!run.completed) {
    throw new RunStateError("Finish the run before the reveal");
  }

  const prompts = await getTodayPrompts(run.date);
  const result = [];
  for (const prompt of prompts) {
    const rows = await loadAnswers(prompt.promptId);

    const { data: counts, error } = await db
      .from("submissions")
      .select("answer_id")
      .eq("prompt_id", prompt.promptId)
      .eq("status", "scored");
    if (error) throw error;
    const countByAnswer = new Map<string, number>();
    for (const c of counts ?? []) {
      if (c.answer_id) {
        countByAnswer.set(c.answer_id, (countByAnswer.get(c.answer_id) ?? 0) + 1);
      }
    }

    const toDto = (r: AnswerRow) => ({
      answer: r.answer,
      tier: r.tier,
      points: r.points,
      quip: r.quip,
      timesGiven: countByAnswer.get(r.id) ?? 0,
    });

    result.push({
      position: prompt.position,
      promptId: prompt.promptId,
      text: prompt.text,
      answers: rows
        .slice()
        .sort((a, b) => b.points - a.points || a.answer.localeCompare(b.answer))
        .map(toDto),
      gems: rows.filter((r) => r.tier === "hail_mary").map(toDto),
    });
  }
  return result;
}

export async function answerPopularity(promptId: string) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("submissions")
    .select("answer_id, answers ( answer )")
    .eq("prompt_id", promptId)
    .eq("status", "scored");
  if (error) throw error;
  const byAnswer = new Map<string, { answer: string; count: number }>();
  for (const row of data ?? []) {
    if (!row.answer_id) continue;
    const ans = Array.isArray(row.answers) ? row.answers[0] : row.answers;
    const name = ans ? (ans as { answer: string }).answer : "";
    const existing = byAnswer.get(row.answer_id);
    if (existing) existing.count += 1;
    else byAnswer.set(row.answer_id, { answer: name, count: 1 });
  }
  return [...byAnswer.values()].sort((a, b) => b.count - a.count);
}
