import { normalizeName } from "./normalize";

/**
 * Compute a similarity score between two entity names, in [0, 1].
 *
 *  - 1.0  : identical after normalization
 *  - 0.85 : one name contains the other (substring after normalization)
 *  - else : Jaccard similarity on tokens of length ≥ 3
 */
export function similarityScore(nameA: string, nameB: string): number {
  const a = normalizeName(nameA);
  const b = normalizeName(nameB);

  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;

  const tokensA = new Set(a.split(" ").filter((t) => t.length >= 3));
  const tokensB = new Set(b.split(" ").filter((t) => t.length >= 3));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
