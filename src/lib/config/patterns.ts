/**
 * RAG Pattern Configuration
 *
 * Centralized configuration for all regex patterns and keyword lists.
 * Edit this file to add new languages or adjust detection sensitivity.
 *
 * Separation of Concerns:
 * - Logic files (evidence-checker.ts) stay clean
 * - All "magic strings" live here for easy maintenance
 */

// ============================================
// QUESTION TYPE DETECTION PATTERNS
// ============================================

/**
 * Patterns to detect NUMERIC questions.
 * "How many?", "What percentage?", "How much?"
 */
export const NUMERIC_PATTERNS = [
  // Spanish
  /cu[aá]ntos?\b/i,
  /total\b/i,
  /n[uú]mero\b/i,
  /porcentaje/i,
  /costo?/i,
  /horas?\b/i,
  /cantidad/i,
  /suma/i,
  /promedio/i,
  /precio/i,
  /monto/i,
  /valor\b/i,
  // English
  /how\s+many/i,
  /how\s+much/i,
];

/**
 * Patterns to detect LIST questions.
 * "What are the...?", "List the...", "Name the..."
 */
export const LIST_PATTERNS = [
  // Spanish
  /cu[aá]les\s+son/i,
  /lista(r)?\b/i,
  /menciona\b/i,
  /enumera\b/i,
  /nombra\b/i,
  /describe\s+los/i,
  // English
  /what\s+are\s+the/i,
  /list\s+the/i,
];

/**
 * Patterns to detect ORDERED/SEQUENCE questions.
 * "What comes after?", "What is the order?", "Steps to..."
 */
export const ORDERED_PATTERNS = [
  // ============================================
  // SPANISH - Sequence/Order Keywords
  // ============================================
  /orden\b/i,
  /secuencia/i,
  /pasos/i,
  /primero.*segundo/i,
  /cronolog/i,

  // Spanish - Prepositions of Sequence
  /despu[eé]s\s+de/i,
  /antes\s+de/i,
  /tras\b/i,
  /a\s+partir\s+de/i,
  /a\s+continuaci[oó]n\s+de/i,
  /previo\s+a/i,
  /posterior\s+a/i,

  // Spanish - Relative Position
  /siguiente[s]?\s+(a|de)\b/i,
  /anterior[es]?\s+(a|de)\b/i,
  /delante\s+de/i,
  /detr[aá]s\s+de/i,
  /encima\s+de/i,
  /debajo\s+de/i,

  // Spanish - Sequence Connectors
  /consecutiv[ao]s?\b/i,
  /seguidamente/i,
  /posteriormente/i,
  /previamente/i,
  /que\s+sigue[n]?\b/i,
  /que\s+precede[n]?\b/i,
  /que\s+viene[n]?\s+despu[eé]s/i,
  /que\s+viene[n]?\s+antes/i,
  /inmediatamente\s+(despu[eé]s|antes|posterior|previo)/i,

  // ============================================
  // ENGLISH - Sequence/Order Keywords
  // ============================================
  /steps/i,
  /sequence/i,
  /in\s+order/i,
  /chronolog/i,

  // English - Prepositions of Sequence
  /after\b/i,
  /before\b/i,
  /following\b/i,
  /preceding\b/i,
  /prior\s+to/i,
  /subsequent\s+to/i,
  /in\s+the\s+wake\s+of/i,

  // English - Relative Position
  /listed\s+after/i,
  /listed\s+before/i,
  /comes?\s+after/i,
  /comes?\s+before/i,
  /follows?\s+after/i,
  /next\s+to/i,
  /in\s+front\s+of/i,
  /behind\b/i,
  /above\b/i,
  /below\b/i,

  // English - Sequence Connectors
  /consecutively/i,
  /subsequently/i,
  /previously/i,
  /that\s+follows?/i,
  /that\s+precedes?/i,
  /immediately\s+(after|before|following|preceding)/i,
];

// ============================================
// EVIDENCE DETECTION PATTERNS
// ============================================

/**
 * Patterns to find NUMERIC evidence in context.
 */
export const NUMERIC_EVIDENCE = [
  /\b\d+\s*(total|en\s+total|reactivos?|preguntas?|horas?|%)/i,
  /\b(total|son|hay|tiene[n]?)[\s:]+\d+/i,
  /\d+(\.\d+)?\s*%/,
  /\$\s*\d+/,
  /\d+\s*(pesos|dolares|euros|usd|mxn)/i,
  /\b\d{1,3}(,\d{3})*(\.\d+)?\b/,
];

/**
 * Patterns to find LIST evidence in context.
 */
export const LIST_EVIDENCE = [
  /(?:^|\n)\s*[-•]\s*\w+/,
  /(?:^|\n)\s*\d+[.\)]\s*\w+/,
  /(?:^|\n)\s*[a-z]\)\s*\w+/i,
  /(?:^|\n)\s*[ivxIVX]+[.\)]\s*\w+/,
];

/**
 * Patterns to find ORDERED evidence in context.
 * NOTE: These are used with density-aware matching in evidence-checker.ts
 */
export const ORDERED_EVIDENCE = [
  /(?:^|\n)\s*(?:step|paso|phase|fase|etapa)\s*\d+/i,
  /(?:^|\n)\s*\d+[.)]\s+/m,
  /(?:^|\n)\s*[a-zA-Z][.)]\s+/m,
  /(?:^|\n)\s*[IVXLCDMivxlcdm]+[.)]\s+/m,
  /(?:^|\n)\s*(?:first|primero|finally|finalmente|next|luego|then|entonces)[,:]?\s+/i,
];

// ============================================
// AGGREGATE/TOTAL KEYWORDS
// ============================================

/**
 * Keywords that indicate a query is asking for totals/aggregates.
 * Used for boosting chunks containing summary rows.
 */
export const AGGREGATE_KEYWORDS = [
  "total",
  "subtotal",
  "suma",
  "en total",
  "puntaje global",
  "resultado final",
  "cantidad total",
  "monto total",
  "grand total",
  "overall",
  "sum",
  "aggregate",
];

// ============================================
// LIST COMPLETENESS KEYWORDS
// ============================================

/**
 * Keywords that indicate a query is asking for a COMPLETE list.
 * Used for dynamic window expansion (±3 instead of ±1).
 */
export const LIST_COMPLETENESS_KEYWORDS = [
  // Spanish
  "todos los",
  "todas las",
  "cuáles son los",
  "cuáles son las",
  "cuales son los",
  "cuales son las",
  "lista completa",
  "posibles",
  "opciones",
  "alternativas",
  "enumera",
  "menciona todos",
  "menciona todas",
  // English
  "all the",
  "what are the",
  "complete list",
  "full list",
  "list all",
  "every",
  "each of the",
  "all possible",
  "all available",
];

// ============================================
// WRITTEN NUMBER MAPPINGS
// ============================================

/**
 * English written numbers to digits.
 * "three out of ten" → "3 out of 10"
 */
export const TEXT_NUMBERS_EN: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
  sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
  thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70",
  eighty: "80", ninety: "90", hundred: "100",
};

/**
 * Spanish written numbers to digits.
 * "tres de cada diez" → "3 de cada 10"
 */
export const TEXT_NUMBERS_ES: Record<string, string> = {
  cero: "0", uno: "1", una: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5",
  seis: "6", siete: "7", ocho: "8", nueve: "9", diez: "10",
  once: "11", doce: "12", trece: "13", catorce: "14", quince: "15",
  veinte: "20", treinta: "30", cuarenta: "40", cincuenta: "50",
  sesenta: "60", setenta: "70", ochenta: "80", noventa: "90", cien: "100",
};

// ============================================
// CONTRADICTION DETECTION PATTERNS
// ============================================

/**
 * Linguistic patterns that indicate self-contradiction.
 */
export const CONTRADICTION_PATTERNS = [
  // Spanish
  /sin\s+embargo.*\d+.*\d+/i,
  /aunque.*diferente/i,
  /por\s+otro\s+lado/i,
  /no\s+se\s+puede\s+(?:confirmar|asegurar).*(?:pero|aunque)/i,
  /contradice/i,
  /no\s+coincide/i,
  /difiere\s+de/i,
  // English
  /however.*\d+.*\d+/i,
  /although.*different/i,
  /on\s+the\s+other\s+hand/i,
  /contradicts/i,
  /does\s+not\s+match/i,
  /differs\s+from/i,
];

// ============================================
// DERIVATION DETECTION PATTERNS
// ============================================

/**
 * Patterns that indicate the LLM is calculating instead of extracting.
 * Model should NEVER compute - only extract.
 */
export const DERIVATION_PATTERNS = [
  // Arithmetic expressions
  /\d+\s*\+\s*\d+/,
  /\d+\s*-\s*\d+\s*=/,
  /\d+\s*[x×*]\s*\d+/,
  /\d+\s*[÷/]\s*\d+/,
  // Spanish calculation language
  /sumando|restando|multiplicando|dividiendo/i,
  /si\s+sumamos/i,
  /al\s+sumar/i,
  /la\s+suma\s+de/i,
  /el\s+resultado\s+(es|seria)\s+\d+/i,
  /por\s+lo\s+tanto.*\d+/i,
  /entonces.*total.*\d+/i,
  /esto\s+(da|resulta|equivale)/i,
  /calculando/i,
  /si\s+calculamos/i,
  // English calculation language
  /adding|subtracting|multiplying|dividing/i,
  /if\s+we\s+(add|sum|subtract)/i,
  /the\s+sum\s+of/i,
  /the\s+result\s+is\s+\d+/i,
  /therefore.*\d+/i,
  /which\s+gives\s+us/i,
];
