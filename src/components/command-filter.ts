import { defaultFilter } from "cmdk";

import { fold } from "@/lib/search";

/**
 * Combobox items use the row id as their cmdk value, so two rows with the same
 * label stay distinct. Search then scores only the readable keywords: an id
 * would fuzzy-match almost any query. Accents don't count ("educacion" finds
 * "Educación").
 */
export function filterByKeywords(_value: string, search: string, keywords?: string[]): number {
  return defaultFilter("", fold(search), keywords?.map(fold));
}

/** cmdk's own scoring on the value and keywords, without accents. */
export function filterIgnoringAccents(value: string, search: string, keywords?: string[]): number {
  return defaultFilter(fold(value), fold(search), keywords?.map(fold));
}
