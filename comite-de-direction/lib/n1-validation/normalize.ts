/**
 * Normalize an entity name for robust comparison.
 *
 * Pipeline: NFD decompose → strip diacritics → lowercase → non-alphanum→space → collapse.
 * See docs/n1_validation_logic.md §3.2 for the canonical reference.
 */
const DIACRITICS = /[̀-ͯ]/g;
const NON_ALPHANUM = /[^a-z0-9]/g;
const MULTI_SPACE = /\s+/g;

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(NON_ALPHANUM, " ")
    .replace(MULTI_SPACE, " ")
    .trim();
}
