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
// 3) NORMALIZATION (do once)
// ================================
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // remove punctuation
    .replace(/\s+/g, " ")
    .trim();
}

// ================================
// 4) RULES (data-driven + scored)
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
