/**
 * Normalization for answer matching, per PRD:
 * lowercase, strip accents, punctuation, and extra spaces;
 * "St." = "Saint", "&" = "and".
 */
export function normalize(input: string): string {
  let s = input.toLowerCase();

  // Expansions that depend on punctuation must run before stripping it.
  s = s.replace(/\bst\.\s*/g, "saint ");
  s = s.replace(/&/g, " and ");

  // Strip accents: decompose, then drop combining marks.
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Apostrophes join name parts ("O'Brien" = "obrien"); other
  // punctuation separates words. Then collapse whitespace.
  s = s.replace(/['’]/g, "");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/** Last whole word of a normalized name; used for surname matching. */
export function surnameOf(normalizedName: string): string {
  const parts = normalizedName.split(" ");
  return parts[parts.length - 1] ?? "";
}
