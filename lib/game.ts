import { db } from "./db";
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

export async function getTodayPrompts(date: string): Promise<TodayPrompt[]> {
  const sql = db();
  const rows = (await sql`
    select ds.position, ds.prompt_id, p.prompt_text, p.sport
    from daily_sets ds
    join prompts p on p.id = ds.prompt_id
    where ds.date = ${date}
    order by ds.position
  `) as {
    position: number;
    prompt_id: string;
    prompt_text: string;
    sport: string;
  }[];
  return rows.map((r) => ({
    position: r.position,
    promptId: r.prompt_id,
    text: r.prompt_text,
    sport: r.sport,
  }));
}

export async function getOrCreateRun(deviceId: string): Promise<RunStateDto> {
  const sql = db();
  const date = todayET();

  const prompts = await getTodayPrompts(date);
  if (prompts.length === 0) {
    throw new NoDailySetError(date);
  }

  await sql`
    insert into players (device_id) values (${deviceId})
    on conflict (device_id) do nothing
  `;

  let runs = (await sql`
    select id, device_id, date::text as date, current_position,
           prompt_started_at::text as prompt_started_at, total_points, completed
    from runs where device_id = ${deviceId} and date = ${date}
  `) as RunRow[];

  if (runs.length === 0) {
    runs = (await sql`
      insert into runs (device_id, date) values (${deviceId}, ${date})
      on conflict (device_id, date) do update set device_id = excluded.device_id
      returning id, device_id, date::text as date, current_position,
                prompt_started_at::text as prompt_started_at, total_points, completed
    `) as RunRow[];
  }
  const run = runs[0];

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
  const sql = db();
  const rows = (await sql`
    select s.position, s.guess, s.status, s.tier, s.points, a.answer
    from submissions s
    left join answers a on a.id = s.answer_id
    where s.run_id = ${runId} and s.status in ('scored', 'timeout')
    order by s.position
  `) as {
    position: number;
    guess: string;
    status: "scored" | "timeout";
    tier: Tier | null;
    points: number;
    answer: string | null;
  }[];
  return rows.map((r) => ({
    position: r.position,
    guess: r.guess,
    answer: r.answer,
    tier: r.tier,
    points: r.points,
    status: r.status,
  }));
}

async function loadRun(runId: string): Promise<RunRow> {
  const sql = db();
  const rows = (await sql`
    select id, device_id, date::text as date, current_position,
           prompt_started_at::text as prompt_started_at, total_points, completed
    from runs where id = ${runId}
  `) as RunRow[];
  if (rows.length === 0) throw new RunStateError("Run not found");
  return rows[0];
}

async function loadAnswers(promptId: string): Promise<AnswerRow[]> {
  const sql = db();
  return (await sql`
    select id, answer, aliases, is_person, tier, points, quip
    from answers where prompt_id = ${promptId}
  `) as AnswerRow[];
}

function toEntries(rows: AnswerRow[]): AnswerEntry[] {
  return rows.map((r) => ({
    id: r.id,
    answer: r.answer,
    aliases: r.aliases ?? [],
    isPerson: r.is_person,
  }));
}

/** Marks the current prompt's clock as started. */
export async function startPrompt(runId: string): Promise<void> {
  const run = await loadRun(runId);
  if (run.completed) throw new RunStateError("Run already completed");
  await db()`
    update runs set prompt_started_at = now() where id = ${runId}
  `;
}

async function advanceRun(
  run: RunRow,
  pointsGained: number
): Promise<{ totalPoints: number; nextPosition: number | null }> {
  const totalPoints = run.total_points + pointsGained;
  const next = run.current_position + 1;
  const nextPosition = next <= PROMPTS_PER_DAY ? next : null;
  await db()`
    update runs
    set total_points = ${totalPoints}, current_position = ${next},
        prompt_started_at = null
    where id = ${run.id}
  `;
  return { totalPoints, nextPosition };
}

async function recordTimeout(
  run: RunRow,
  promptId: string
): Promise<SubmitResponse> {
  await db()`
    insert into submissions (run_id, prompt_id, position, guess, status, points)
    values (${run.id}, ${promptId}, ${run.current_position}, '', 'timeout', 0)
  `;
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
  const sql = db();
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
    const elapsed = Date.now() - new Date(run.prompt_started_at).getTime();
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
    await sql`
      insert into submissions (run_id, prompt_id, position, guess, status, points)
      values (${run.id}, ${prompt.promptId}, ${run.current_position},
              ${guess}, 'rejected', 0)
    `;
    return { result: "reject", reason: match.reason };
  }

  // A suggestion only scores after the player confirms it.
  if (match.type === "suggest" && !input.accept) {
    return { result: "suggest", suggestion: match.entry.answer };
  }

  const row = rows.find((r) => r.id === match.entry.id)!;
  await sql`
    insert into submissions
      (run_id, prompt_id, position, guess, answer_id, status, tier, points)
    values (${run.id}, ${prompt.promptId}, ${run.current_position},
            ${guess}, ${row.id}, 'scored', ${row.tier}, ${row.points})
  `;

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
  const sql = db();
  const run = await loadRun(runId);

  if (!run.completed) {
    if (run.current_position <= PROMPTS_PER_DAY) {
      throw new RunStateError("Run still has prompts left");
    }
    await sql`update runs set completed = true where id = ${runId}`;
    run.completed = true;
  }

  const counts = (await sql`
    select
      count(*)::int as players_today,
      count(*) filter (where total_points < ${run.total_points})::int as beaten
    from runs where date = ${run.date} and completed = true
  `) as { players_today: number; beaten: number }[];

  const total = counts[0]?.players_today ?? 0;
  const beaten = counts[0]?.beaten ?? 0;
  const percentile =
    total > 1 ? Math.round((beaten / (total - 1)) * 100) : null;

  return { run, playersToday: total, percentile };
}

export async function revealAnswers(runId: string) {
  const sql = db();
  const run = await loadRun(runId);
  if (!run.completed) {
    throw new RunStateError("Finish the run before the reveal");
  }

  const prompts = await getTodayPrompts(run.date);
  const result = [];
  for (const prompt of prompts) {
    const rows = await loadAnswers(prompt.promptId);

    const counts = (await sql`
      select answer_id, count(*)::int as times
      from submissions
      where prompt_id = ${prompt.promptId} and status = 'scored'
        and answer_id is not null
      group by answer_id
    `) as { answer_id: string; times: number }[];
    const countByAnswer = new Map(counts.map((c) => [c.answer_id, c.times]));

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
      // Most familiar first: the names everyone types, down to deep cuts.
      answers: rows
        .slice()
        .sort((a, b) => a.points - b.points || a.answer.localeCompare(b.answer))
        .map(toDto),
      gems: rows.filter((r) => r.tier === "hail_mary").map(toDto),
    });
  }
  return result;
}

export async function answerPopularity(promptId: string) {
  const rows = (await db()`
    select a.answer, count(*)::int as count
    from submissions s
    join answers a on a.id = s.answer_id
    where s.prompt_id = ${promptId} and s.status = 'scored'
    group by a.answer
    order by count desc
  `) as { answer: string; count: number }[];
  return rows;
}
