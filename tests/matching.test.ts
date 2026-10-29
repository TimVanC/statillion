import { describe, expect, it } from "vitest";
import { normalize } from "../lib/matching/normalize";
import {
  AnswerEntry,
  buildIndex,
  editDistance,
  matchGuess,
} from "../lib/matching/match";

function person(id: string, answer: string, aliases: string[] = []): AnswerEntry {
  return { id, answer, aliases, isPerson: true };
}

function thing(id: string, answer: string, aliases: string[] = []): AnswerEntry {
  return { id, answer, aliases, isPerson: false };
}

/**
 * Fixture mirroring the PRD examples table: a mixed answer set with
 * people, events, penalties, aliases, and several shared surnames.
 */
const entries: AnswerEntry[] = [
  thing("hammer-throw", "Hammer throw"),
  person("lebron", "LeBron James", ["King James", "The King"]),
  person("gronk", "Rob Gronkowski", ["Gronk"]),
  thing("holding", "Holding"),
  person("mahomes", "Patrick Mahomes"),
  person("a-johnson", "Andre Johnson"),
  person("c-johnson", "Calvin Johnson", ["Megatron"]),
  person("chad-johnson", "Chad Johnson", ["Chad Ochocinco"]),
  person("cmc", "Christian McCaffrey", ["CMC"]),
  person("brady", "Tom Brady", ["TB12"]),
  person("ronaldo", "Cristiano Ronaldo", ["CR7"]),
  person("jose", "José Altuve"),
  thing("st-louis", "St. Louis Rams"),
];

const index = buildIndex(entries);

describe("normalize", () => {
  it("lowercases and trims extra spaces", () => {
    expect(normalize("  LeBron   JAMES ")).toBe("lebron james");
  });

  it("strips accents", () => {
    expect(normalize("José Altuve")).toBe("jose altuve");
  });

  it("strips punctuation", () => {
    expect(normalize("O'Brien, Jr.")).toBe("obrien jr");
  });

  it("expands St. to Saint", () => {
    expect(normalize("St. Louis Rams")).toBe("saint louis rams");
  });

  it("expands & to and", () => {
    expect(normalize("Rock & Roll")).toBe("rock and roll");
  });
});

describe("editDistance", () => {
  it("counts single edits", () => {
    expect(editDistance("gronk", "gronc", 2)).toBe(1);
    expect(editDistance("jmes", "james", 2)).toBe(1);
  });

  it("returns cutoff + 1 when exceeded", () => {
    expect(editDistance("xyz", "patrick mahomes", 2)).toBe(3);
  });
});

describe("matchGuess: every example from the PRD table", () => {
  it('"hammer" suggests Hammer throw', () => {
    const r = matchGuess("hammer", index);
    expect(r).toEqual({
      type: "suggest",
      entry: expect.objectContaining({ answer: "Hammer throw" }),
    });
  });

  it('"lebron jmes" suggests LeBron James', () => {
    const r = matchGuess("lebron jmes", index);
    expect(r).toEqual({
      type: "suggest",
      entry: expect.objectContaining({ answer: "LeBron James" }),
    });
  });

  it('"gronk" is accepted instantly as Rob Gronkowski (exact alias)', () => {
    const r = matchGuess("gronk", index);
    expect(r).toEqual({
      type: "exact",
      entry: expect.objectContaining({ answer: "Rob Gronkowski" }),
    });
  });

  it('"holding" is accepted instantly (exact match, case-insensitive)', () => {
    const r = matchGuess("HOLDING", index);
    expect(r).toEqual({
      type: "exact",
      entry: expect.objectContaining({ answer: "Holding" }),
    });
  });

  it('"mahomes" suggests Patrick Mahomes (unique surname)', () => {
    const r = matchGuess("mahomes", index);
    expect(r).toEqual({
      type: "suggest",
      entry: expect.objectContaining({ answer: "Patrick Mahomes" }),
    });
  });

  it('"johnson" is not accepted; too many matches', () => {
    const r = matchGuess("johnson", index);
    expect(r).toEqual({ type: "reject", reason: "ambiguous-person" });
  });

  it('"xyz player" is not in the list', () => {
    const r = matchGuess("xyz player", index);
    expect(r).toEqual({ type: "reject", reason: "not-found" });
  });
});

describe("matchGuess: PRD rules beyond the table", () => {
  it("accepts accented answers typed without accents", () => {
    const r = matchGuess("jose altuve", index);
    expect(r).toEqual({
      type: "exact",
      entry: expect.objectContaining({ answer: "José Altuve" }),
    });
  });

  it("aliases shorter than 5 letters only match exactly (no typo match)", () => {
    // "cmd" is one edit from alias "cmc" but short aliases are exact-only.
    const r = matchGuess("cmd", index);
    expect(r.type).toBe("reject");
  });

  it("short alias exact match still accepts", () => {
    const r = matchGuess("cmc", index);
    expect(r).toEqual({
      type: "exact",
      entry: expect.objectContaining({ answer: "Christian McCaffrey" }),
    });
  });

  it("typo matching checks primary names before aliases", () => {
    // "king james" is an alias of LeBron; a one-off typo of a primary
    // name must win over an equally close alias.
    const withCollision = buildIndex([
      person("kj", "King Jamies"),
      person("lebron", "LeBron James", ["King James"]),
    ]);
    const r = matchGuess("king jamie", withCollision);
    expect(r).toEqual({
      type: "suggest",
      entry: expect.objectContaining({ answer: "King Jamies" }),
    });
  });

  it("does not suggest when two answers tie at the same edit distance", () => {
    const tied = buildIndex([
      person("a", "Jon Moxley"),
      person("b", "Jon Mosley"),
    ]);
    expect(matchGuess("jon moxsley", tied).type).toBe("reject");
  });

  it("empty and whitespace guesses reject", () => {
    expect(matchGuess("   ", index).type).toBe("reject");
  });

  it("prefix match requires a unique hit", () => {
    const dupes = buildIndex([
      thing("a", "Face mask"),
      thing("b", "Face guarding"),
    ]);
    expect(matchGuess("face", dupes).type).toBe("reject");
  });

  it("never suggests a big leap from what was typed", () => {
    expect(matchGuess("zzzzzz", index).type).toBe("reject");
  });
});
