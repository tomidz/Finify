import { defaultFilter } from "cmdk";

/**
 * Combobox items use the row id as their cmdk value, so two rows with the same
 * label stay distinct. Search then scores only the readable keywords: an id
 * would fuzzy-match almost any query.
 */
export function filterByKeywords(_value: string, search: string, keywords?: string[]): number {
  return defaultFilter("", search, keywords);
}
