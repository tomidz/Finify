/** Lowercase without accents: "Café Ñandú" → "cafe nandu". */
export function fold(text: string): string {
  return text.normalize("NFD").toLowerCase().replace(/[̀-ͯ]/g, "");
}

/**
 * Whether every whitespace-separated word of `query` appears in some field,
 * ignoring case and accents ("cafe" matches "Café"). An empty query matches
 * everything.
 */
export function matchesAllWords(fields: readonly (string | null | undefined)[], query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const folded = fields.filter((field): field is string => !!field).map(fold);
  return words.every((word) => folded.some((field) => field.includes(word)));
}
