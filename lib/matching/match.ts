import { normalize, surnameOf } from "./normalize";

export interface AnswerEntry {
  /** Stable id (database row id). */
  id: string;
  /** Canonical display name, e.g. "Rob Gronkowski". */
  answer: string;
  /** Alternate accepted spellings and nicknames, e.g. ["Gronk"]. */
  aliases: string[];
  /** People get surname matching; things like penalties do not. */
  isPerson: boolean;
}

interface IndexedEntry {
  entry: AnswerEntry;
  normAnswer: string;
  normAliases: string[];
  surname: string;
}

export interface MatchIndex {
  entries: IndexedEntry[];
}

export type MatchResult =
  | { type: "exact"; entry: AnswerEntry }
  | { type: "suggest"; entry: AnswerEntry }
  | { type: "reject"; reason: "ambiguous-person" | "not-found" };

/** Build once per prompt (server-side) and reuse across guesses. */
export function buildIndex(entries: AnswerEntry[]): MatchIndex {
  return {
    entries: entries.map((entry) => {
      const normAnswer = normalize(entry.answer);
      return {
        entry,
        normAnswer,
        normAliases: entry.aliases.map(normalize).filter((a) => a.length > 0),
        surname: entry.isPerson ? surnameOf(normAnswer) : "",
      };
    }),
  };
}

/** Levenshtein distance with a cutoff; returns cutoff + 1 when exceeded. */
export function editDistance(a: string, b: string, cutoff: number): number {
  if (Math.abs(a.length - b.length) > cutoff) return cutoff + 1;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cutoff) return cutoff + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n] <= cutoff ? prev[n] : cutoff + 1;
}

function containsWholeWord(haystack: string, needle: string): boolean {
  const words = haystack.split(" ");
  const needleWords = needle.split(" ");
  for (let i = 0; i + needleWords.length <= words.length; i++) {
    let ok = true;
    for (let j = 0; j < needleWords.length; j++) {
      if (words[i + j] !== needleWords[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

const MIN_PARTIAL_LENGTH = 3;
const SHORT_ALIAS_LENGTH = 5; // aliases shorter than this match exactly only
const SHORT_INPUT_LENGTH = 6; // inputs shorter than this allow edit distance 1

/**
 * Server-side matching order per PRD:
 * 1. Normalize.
 * 2. Exact match on answer or alias: accept immediately.
 * 3. Prefix or whole-word partial on the answer: suggest if exactly one hit.
 * 4. Surname match for people: suggest if exactly one hit, reject as
 *    ambiguous if several.
 * 5. Typo match (edit distance 1 below 6 letters, else 2), primary names
 *    before aliases, short aliases excluded: suggest the single closest
 *    answer only if it clearly beats the runner-up.
 * 6. Otherwise reject. Never a list, never a big leap.
 */
export function matchGuess(rawGuess: string, index: MatchIndex): MatchResult {
  const guess = normalize(rawGuess);
  if (guess.length === 0) return { type: "reject", reason: "not-found" };

  // 2. Exact match on answer or any alias.
  for (const ie of index.entries) {
    if (ie.normAnswer === guess || ie.normAliases.includes(guess)) {
      return { type: "exact", entry: ie.entry };
    }
  }

  // 3. Prefix or whole-word partial match against primary names.
  if (guess.length >= MIN_PARTIAL_LENGTH) {
    const partialHits = index.entries.filter(
      (ie) =>
        ie.normAnswer !== guess &&
        (ie.normAnswer.startsWith(guess + " ") ||
          (ie.normAnswer.startsWith(guess) &&
            ie.normAnswer.length > guess.length) ||
          containsWholeWord(ie.normAnswer, guess))
    );
    if (partialHits.length === 1) {
      return { type: "suggest", entry: partialHits[0].entry };
    }
    // Multiple partial hits on people often means a shared name part;
    // fall through to surname handling for a better rejection message.
  }

  // 4. Surname match for people.
  if (!guess.includes(" ")) {
    const surnameHits = index.entries.filter(
      (ie) => ie.entry.isPerson && ie.surname === guess
    );
    if (surnameHits.length === 1) {
      return { type: "suggest", entry: surnameHits[0].entry };
    }
    if (surnameHits.length > 1) {
      return { type: "reject", reason: "ambiguous-person" };
    }
  }

  // 5. Typo match: primary names first, then aliases of 5+ letters.
  const cutoff = guess.length < SHORT_INPUT_LENGTH ? 1 : 2;

  const best = { dist: cutoff + 1, hits: [] as IndexedEntry[] };
  const consider = (ie: IndexedEntry, candidate: string) => {
    const d = editDistance(guess, candidate, cutoff);
    if (d < best.dist) {
      best.dist = d;
      best.hits = [ie];
    } else if (d === best.dist && !best.hits.includes(ie)) {
      best.hits.push(ie);
    }
  };

  for (const ie of index.entries) consider(ie, ie.normAnswer);
  if (best.dist > cutoff) {
    for (const ie of index.entries) {
      for (const alias of ie.normAliases) {
        if (alias.length >= SHORT_ALIAS_LENGTH) consider(ie, alias);
      }
    }
  }

  // Suggest only a unique winner that clearly beats the runner-up.
  if (best.dist <= cutoff && best.hits.length === 1) {
    return { type: "suggest", entry: best.hits[0].entry };
  }

  return { type: "reject", reason: "not-found" };
}
