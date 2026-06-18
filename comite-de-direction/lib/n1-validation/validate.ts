import { normalizeName } from "./normalize";
import { similarityScore } from "./similarity";

export type Verdict = "nouveau" | "marginal" | "existant";
export type ValidationType = "acteurs" | "marchandises";

export interface Entity {
  name: string;
  volume: number;
}

export interface Alias {
  nameN: string;
  nameNMinus1: string;
}

export interface ValidationResult {
  entityName: string;
  volumeN: number;
  volumeNMinus1: number;
  matchScore: number;
  matchedName: string | null;
  verdict: Verdict;
  reason: string;
}

export interface ValidateOptions {
  similarityThreshold?: number;
  marginalThreshold?: number;
  growthThreshold?: number;
  type?: ValidationType;
  aliases?: Alias[];
}

const DEFAULTS = {
  similarityThreshold: 0.72,
  marginalThreshold: 0.3,
  growthThreshold: 0.3,
  type: "acteurs" as const,
};

function buildAliasIndex(aliases: Alias[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const a of aliases) {
    idx.set(normalizeName(a.nameN), normalizeName(a.nameNMinus1));
  }
  return idx;
}

function findBestMatch(
  candidate: Entity,
  reference: Entity[],
): { match: Entity | null; score: number } {
  let best: Entity | null = null;
  let bestScore = 0;

  for (const ref of reference) {
    const score = similarityScore(candidate.name, ref.name);
    if (score > bestScore) {
      bestScore = score;
      best = ref;
    }
  }
  return { match: best, score: bestScore };
}

function decideVerdict(
  candidate: Entity,
  match: Entity | null,
  score: number,
  opts: Required<Omit<ValidateOptions, "aliases">>,
): { verdict: Verdict; reason: string } {
  if (!match || score < opts.similarityThreshold) {
    return { verdict: "nouveau", reason: "Pas de match N-1 au-dessus du seuil" };
  }
  if (match.volume === 0) {
    return { verdict: "nouveau", reason: "Présent dans le référentiel N-1 mais volume = 0" };
  }
  if (opts.type === "marchandises") {
    const growth = (candidate.volume - match.volume) / match.volume;
    if (growth >= opts.growthThreshold) {
      return {
        verdict: "nouveau",
        reason: `Croissance +${Math.round(growth * 100)}% — montée en puissance`,
      };
    }
    return { verdict: "existant", reason: "Marchandise déjà présente, croissance modérée" };
  }
  if (match.volume < candidate.volume * opts.marginalThreshold) {
    return {
      verdict: "marginal",
      reason: `Volume N-1 = ${Math.round(
        (match.volume / candidate.volume) * 100,
      )}% du volume N`,
    };
  }
  return { verdict: "existant", reason: "Acteur significativement présent en N-1" };
}

export function validateNewEntrants(
  candidates: Entity[],
  reference: Entity[],
  options: ValidateOptions = {},
): ValidationResult[] {
  const opts = {
    similarityThreshold: options.similarityThreshold ?? DEFAULTS.similarityThreshold,
    marginalThreshold: options.marginalThreshold ?? DEFAULTS.marginalThreshold,
    growthThreshold: options.growthThreshold ?? DEFAULTS.growthThreshold,
    type: options.type ?? DEFAULTS.type,
  };

  const aliasIdx = options.aliases ? buildAliasIndex(options.aliases) : null;

  const results: ValidationResult[] = [];
  for (const candidate of candidates) {
    let match: Entity | null = null;
    let score = 0;

    if (aliasIdx) {
      const aliasTarget = aliasIdx.get(normalizeName(candidate.name));
      if (aliasTarget) {
        match =
          reference.find((r) => normalizeName(r.name) === aliasTarget) ?? null;
        if (match) score = 1;
      }
    }

    if (!match) {
      const found = findBestMatch(candidate, reference);
      match = found.match;
      score = found.score;
    }

    const { verdict, reason } = decideVerdict(candidate, match, score, opts);

    results.push({
      entityName: candidate.name,
      volumeN: candidate.volume,
      volumeNMinus1: match?.volume ?? 0,
      matchScore: Math.round(score * 100) / 100,
      matchedName: match?.name ?? null,
      verdict,
      reason,
    });
  }

  return results;
}

export function summarizeVerdicts(
  results: ValidationResult[],
): Record<Verdict, number> {
  const summary: Record<Verdict, number> = {
    nouveau: 0,
    marginal: 0,
    existant: 0,
  };
  for (const r of results) summary[r.verdict] += 1;
  return summary;
}
