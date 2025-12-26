// EVIDENCE CHECKER SERVICE
//
// 1) Classifies question INTENT (pure detection, scored + weighted)
// 2) Maps intent → hybrid search params (alpha, fusion)
// 3) Accent-insensitive matching via normalization
//
// Usage:
//   const { type, config, debug } = classifyAndGetConfig(query);
//   // type: QuestionType
//   // config: { alpha, fusionType }
//   // debug: { normalized, scores } - for logging/tuning

import { normalize } from '@/lib/utils/normalize';

// ================================
// 1) INTENT (pure detection)
// ================================
export enum QuestionType {
  NUMERIC = "numeric",
  LIST = "list",
  ORDERED_SEQUENCE = "ordered",
  REGLA_GENERAL = "regla_general",
}

// ================================
// 2) SEARCH TUNING (separate)
// ================================
export type FusionType = "relativeScoreFusion" | "rankedFusion";

export interface HybridConfig {
  alpha: number; // 0=keyword, 1=vector
  fusionType: FusionType;
}

export const HYBRID_TUNING: Record<QuestionType, HybridConfig> = {
  [QuestionType.NUMERIC]: { alpha: 0.35, fusionType: "rankedFusion" },
  [QuestionType.LIST]: { alpha: 0.5, fusionType: "relativeScoreFusion" },
  [QuestionType.ORDERED_SEQUENCE]: { alpha: 0.4, fusionType: "relativeScoreFusion" },
  [QuestionType.REGLA_GENERAL]: { alpha: 0.75, fusionType: "relativeScoreFusion" },
};

export function getHybridConfig(type: QuestionType): HybridConfig {
  return HYBRID_TUNING[type];
}

// ================================
// 3) RULES (data-driven + scored)
// ================================
type Pattern = { re: RegExp; weight?: number; name?: string };
type Rule = { type: QuestionType; priority: number; patterns: Pattern[] };

function w(re: RegExp, weight = 1, name?: string): Pattern {
  return { re, weight, name };
}

function phrase(phraseText: string, weight = 1, name?: string): Pattern {
  // Phrase must be written in normalized form (no accents).
  const escaped = phraseText
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return w(new RegExp(`\\b${escaped}\\b`, "u"), weight, name ?? phraseText);
}

/**
 * Patterns must match *normalized* query text.
 * So: "cuánto" becomes "cuanto" before matching.
 */
const RULES: Rule[] = [
  {
    type: QuestionType.ORDERED_SEQUENCE,
    priority: 3,
    patterns: [
      phrase("en que orden"),
      phrase("in what order"),
      phrase("sequence of"),
      phrase("steps to"),
      phrase("steps for"),
      phrase("pasos para"),
      phrase("procedimiento para"),
      w(/\b(primero|first)\b.*\b(segundo|second)\b.*\b(tercero|third)\b/u, 3, "first-second-third"),
      w(/\b(step|paso|fase|phase|etapa)\s+\d+\b/u, 2, "step N"),
      w(/\b(chronological|cronologic)\w*\b/u, 1, "chronological"),
      w(/\b(after|before|despues|antes)\b/u, 1, "after/before"),
    ],
  },
  {
    type: QuestionType.NUMERIC,
    priority: 2,
    patterns: [
      phrase("how many"),
      phrase("how much"),
      phrase("cual es el monto", 2),
      w(/\bcuanto(s)?\b/u, 2, "cuanto(s)"),
      w(/\b(total|numero|porcentaje|percent|percentage)\b/u, 2, "numeric keywords"),
      w(/\b(precio|monto|valor|tasa|plazo|rendimiento|promedio)\b/u, 2, "money/rate"),
      w(/\b\d+(\.\d+)?\s*(%|percent|porcentaje|porcentagem)\b/u, 3, "number + percent"),
      w(/\b\d+(\.\d+)?\b/u, 1, "contains number"),
    ],
  },
  {
    type: QuestionType.LIST,
    priority: 1,
    patterns: [
      phrase("cuales son", 2),
      phrase("what are the", 2),
      phrase("list the", 2),
      w(/\b(lista(r)?|menciona|enumera|nombra)\b/u, 2, "list verbs"),
    ],
  },
];

// ================================
// 5) CLASSIFIER (score + tie-break)
// ================================
export type ClassificationDebug = {
  normalized: string;
  scores: Array<{
    type: QuestionType;
    score: number;
    priority: number;
    hits: Array<{ name?: string; weight: number; re: string }>;
  }>;
};

export function classifyQuestion(query: string): QuestionType {
  return classifyQuestionWithDebug(query).type;
}

export function classifyQuestionWithDebug(query: string): { type: QuestionType; debug: ClassificationDebug } {
  const q = normalize(query);

  let bestType: QuestionType = QuestionType.REGLA_GENERAL;
  let bestScore = 0;
  let bestPriority = 0;

  const debugScores: ClassificationDebug["scores"] = [];

  for (const rule of RULES) {
    let score = 0;
    const hits: ClassificationDebug["scores"][number]["hits"] = [];

    for (const p of rule.patterns) {
      if (p.re.test(q)) {
        const weight = p.weight ?? 1;
        score += weight;
        hits.push({ name: p.name, weight, re: p.re.source });
      }
    }

    debugScores.push({ type: rule.type, score, priority: rule.priority, hits });

    if (score > bestScore || (score === bestScore && rule.priority > bestPriority)) {
      bestScore = score;
      bestPriority = rule.priority;
      bestType = rule.type;
    }
  }

  return {
    type: bestScore > 0 ? bestType : QuestionType.REGLA_GENERAL,
    debug: { normalized: q, scores: debugScores },
  };
}

// ================================
// 6) CONVENIENCE (intent + tuning)
// ================================
export function classifyAndGetConfig(query: string): {
  type: QuestionType;
  config: HybridConfig;
  debug: ClassificationDebug;
} {
  const { type, debug } = classifyQuestionWithDebug(query);
  return { type, config: getHybridConfig(type), debug };
}

// ================================
// 7) LIST STRUCTURE + COUNT MISMATCH (LANGUAGE-AGNOSTIC)
// ================================

export function detectListStructure(text: string): {
  isList: boolean;
  itemCount: number;
  patterns: string[];
  listStart: number | null;
} {
  const patterns: string[] = [];
  let itemCount = 0;

  // 1) Bullets
  const bulletRe = /^[\s]*[-•*◦▪►]\s+.+/gm;
  const bulletMatches = text.match(bulletRe) || [];
  if (bulletMatches.length >= 2) {
    patterns.push("bullets");
    itemCount = Math.max(itemCount, bulletMatches.length);
  }

  // 2) Numbered/lettered/roman lists
  const numberedRe = /^[\s]*(?:\d+|[a-z]|[ivxlcdm]+)[.)\-:]\s+.+/gim;
  const numberedMatches = text.match(numberedRe) || [];
  if (numberedMatches.length >= 2) {
    patterns.push("numbered");
    itemCount = Math.max(itemCount, numberedMatches.length);
  }

  // 3) Domain codes (strong): EC0110.02, EC1254, etc (avoid NOM 247 false hits)
  const ecCodeRe = /\bEC\d{3,4}(?:\.\d{1,3})?\b/g;
  const ecCodes = text.match(ecCodeRe) || [];
  const uniqueEc = new Set(ecCodes);
  if (uniqueEc.size >= 2) {
    patterns.push("codes");
    itemCount = Math.max(itemCount, uniqueEc.size);
  }

  // Find listStart = earliest occurrence of a "strong list line"
  const strongLineRe = /(^[\s]*[-•*◦▪►]\s+.+)|(^[\s]*(?:\d+|[a-z]|[ivxlcdm]+)[.)\-:]\s+.+)|(^[\s]*EC\d{3,4}(?:\.\d{1,3})?\b)/gim;
  const m = strongLineRe.exec(text);
  const listStart = m ? (m.index ?? null) : null;

  return {
    isList: patterns.length > 0,
    itemCount,
    patterns,
    listStart,
  };
}

/**
 * Detects "declared total" vs visible list items WITHOUT keywords.
 * Heuristic: take the last standalone integer (3..100) within ~220 chars BEFORE listStart.
 * Hardened against: percentages (66%), phone prefixes (55...), decimals (.78)
 */
export function detectCountMismatch(text: string): {
  hasMismatch: boolean;
  declaredTotal: number | null;
  visibleItems: number;
  debug: { listStart: number | null; patterns: string[]; windowText: string };
} {
  const info = detectListStructure(text);
  const visibleItems = info.itemCount;

  // If we don't even see list structure, don't claim mismatch
  if (!info.isList || info.listStart === null || visibleItems < 3) {
    return {
      hasMismatch: false,
      declaredTotal: null,
      visibleItems,
      debug: { listStart: info.listStart, patterns: info.patterns, windowText: "" },
    };
  }

  const start = Math.max(0, info.listStart - 220);
  const windowText = text.slice(start, info.listStart);

  // Find standalone integers 3..100, filtering out noisy patterns
  const matches = Array.from(windowText.matchAll(/\b(\d{1,3})\b/g));
  const nums: number[] = [];

  for (const m of matches) {
    const val = parseInt(m[1], 10);
    if (val < 3 || val > 100) continue;

    const idx = m.index!;
    const len = m[1].length;
    const charBefore = idx > 0 ? windowText[idx - 1] : '';
    const charAfter = idx + len < windowText.length ? windowText[idx + len] : '';

    // Filter out percentages: 66%, %66
    if (charBefore === '%' || charAfter === '%') continue;

    // Filter out decimals: .78, 3.14
    if (charBefore === '.' || charAfter === '.') continue;

    // Filter out currency-adjacent: $55, 55$
    if (charBefore === '$' || charAfter === '$') continue;

    nums.push(val);
  }

  const declaredTotal = nums.length ? nums[nums.length - 1] : null;

  // Plausibility check: declaredTotal shouldn't be wildly larger than visible
  // Allows "13 vs 6" but blocks "55 vs 6" (likely phone/noise)
  const plausible = declaredTotal !== null &&
    declaredTotal <= Math.max(visibleItems * 3, 25);

  // Mismatch only if declaredTotal is meaningfully bigger than visible AND plausible
  const hasMismatch =
    declaredTotal !== null &&
    plausible &&
    visibleItems >= 3 &&
    declaredTotal >= visibleItems + 3;

  return {
    hasMismatch,
    declaredTotal,
    visibleItems,
    debug: { listStart: info.listStart, patterns: info.patterns, windowText },
  };
}
