/**
 * Document Capability Inference Layer (v2.0)
 *
 * Automatically infers what a document CAN and CANNOT answer
 * based on content patterns. Language-agnostic.
 *
 * This enables pre-retrieval blocking of impossible questions.
 *
 * Example capabilities:
 * - hasPeople: Can answer "who is responsible for X?"
 * - hasBudgets: Can answer "what is the cost of X?"
 * - hasLiveData: Can answer "what is the current X?"
 * - hasOrgStructure: Can answer "what department handles X?"
 */

import { ChunkStructure } from '@/lib/core/types';

// CAPABILITY TYPES

export interface DocumentCapabilities {
  /** Document contains person names (can answer "who" questions) */
  hasPeople: boolean;
  /** Document contains monetary values (can answer budget/cost questions) */
  hasBudgets: boolean;
  /**
   * Document contains temporal markers (recent years, "vigente", etc.)
   * NOTE: This does NOT mean "live/real-time data" - just temporal context.
   * For actual live data (prices, rates), use external APIs.
   */
  hasTemporalContext: boolean;
  /** Document contains organizational hierarchy */
  hasOrgStructure: boolean;
  /** Document contains dates/deadlines */
  hasDates: boolean;
  /** Document contains procedures/steps */
  hasProcedures: boolean;
  /** Document contains definitions */
  hasDefinitions: boolean;
  /** Document contains tables with data */
  hasTables: boolean;
  /** Document contains enumerated lists */
  hasEnumerations: boolean;
  /** Raw capability signals (for debugging) */
  signals: CapabilitySignals;
}

export interface CapabilitySignals {
  personNameCount: number;
  currencyPatternCount: number;
  temporalMarkerCount: number;
  orgPatternCount: number;
  datePatternCount: number;
  procedurePatternCount: number;
  definitionPatternCount: number;
  tableStructureCount: number;
  enumerationCount: number;
}

// PATTERN DETECTION (Language-Agnostic)

/**
 * Detect person names (language-agnostic).
 * Looks for capitalized word sequences typical of names.
 */
function detectPersonNames(text: string): number {
  // Pattern: 2-4 capitalized words in sequence (common for names)
  const namePattern = /(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+){1,3}[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/g;
  const matches = text.match(namePattern) || [];

  // Filter out common false positives (place names, org names)
  const falsePositives = [
    /Ciudad de/i, /Estado de/i, /República de/i,
    /Secretaría de/i, /Dirección de/i, /Departamento de/i,
    /University of/i, /Institute of/i, /Ministry of/i,
  ];

  const filteredMatches = matches.filter(m =>
    !falsePositives.some(fp => fp.test(m))
  );

  return filteredMatches.length;
}

/**
 * Detect currency/monetary patterns.
 */
function detectCurrencyPatterns(text: string): number {
  const patterns = [
    /\$\s*[\d,]+(?:\.\d{2})?/g,                    // $1,234.56
    /[\d,]+(?:\.\d{2})?\s*(?:USD|EUR|MXN|pesos?|dólares?|euros?)/gi,
    /(?:presupuesto|monto|costo|precio|valor|importe)\s*:?\s*[\d,]+/gi,
    /(?:budget|cost|price|amount|total)\s*:?\s*[\d,]+/gi,
  ];

  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Detect temporal markers suggesting current/live data.
 */
function detectTemporalMarkers(text: string): number {
  const patterns = [
    /(?:202[4-9]|203\d)/g,                         // Recent years
    /(?:actualmente|currently|ahora|now|vigente)/gi,
    /(?:este año|this year|este mes|this month)/gi,
    /(?:a la fecha|as of today|hasta la fecha)/gi,
  ];

  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Detect organizational structure patterns.
 */
function detectOrgPatterns(text: string): number {
  const patterns = [
    /(?:Secretaría|Dirección|Departamento|Gerencia|Jefatura|Coordinación|Subdirección)/gi,
    /(?:Department|Division|Office|Unit|Section|Branch|Bureau)/gi,
    /(?:reporta a|reports to|depende de|depends on)/gi,
    /(?:organigrama|organizational chart|estructura organizacional)/gi,
  ];

  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Detect date patterns.
 */
function detectDatePatterns(text: string): number {
  const patterns = [
    /\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/gi,
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/gi,
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g,
    /(?:plazo|deadline|fecha límite|due date)\s*:?\s*\d/gi,
  ];

  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Detect procedure/step patterns.
 */
function detectProcedurePatterns(text: string): number {
  const patterns = [
    /(?:paso|step|etapa|phase|fase)\s*\d+/gi,
    /(?:primero|segundo|tercero|cuarto|quinto|first|second|third|fourth|fifth)/gi,
    /(?:procedimiento|procedure|proceso|process|instrucciones|instructions)/gi,
    /(?:a continuación|siguiente|next|then|después|after)/gi,
  ];

  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Detect definition patterns.
 */
function detectDefinitionPatterns(text: string): number {
  const patterns = [
    /(?:se\s+(?:define|entiende|considera)\s+(?:como|por))/gi,
    /(?:significa|means|refers to)/gi,
    /(?:es\s+(?:el|la|un|una)\s+\w+\s+(?:que|donde|mediante))/gi,
    /[A-ZÁÉÍÓÚÑ][^:.\n]{2,30}:\s+[a-záéíóúñ]/gm,  // "Term: definition"
  ];

  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

// CAPABILITY INFERENCE

/**
 * Infer document capabilities from text content.
 * Works with any document regardless of language.
 */
export function inferCapabilities(text: string): DocumentCapabilities {
  const signals: CapabilitySignals = {
    personNameCount: detectPersonNames(text),
    currencyPatternCount: detectCurrencyPatterns(text),
    temporalMarkerCount: detectTemporalMarkers(text),
    orgPatternCount: detectOrgPatterns(text),
    datePatternCount: detectDatePatterns(text),
    procedurePatternCount: detectProcedurePatterns(text),
    definitionPatternCount: detectDefinitionPatterns(text),
    tableStructureCount: (text.match(/\|/g)?.length || 0) >= 10 ? 1 : 0,
    enumerationCount: (text.match(/(?:^|\n)\s*(?:\d+[.)]|[a-z]\))\s+\S/gm)?.length ?? 0),
  };

  return {
    hasPeople: signals.personNameCount >= 2,
    hasBudgets: signals.currencyPatternCount >= 1,
    // NOTE: This is temporal CONTEXT, not live data. "2024" or "vigente" ≠ real-time.
    hasTemporalContext: signals.temporalMarkerCount >= 2,
    hasOrgStructure: signals.orgPatternCount >= 3,
    hasDates: signals.datePatternCount >= 2,
    hasProcedures: signals.procedurePatternCount >= 3,
    hasDefinitions: signals.definitionPatternCount >= 2,
    hasTables: signals.tableStructureCount >= 1,
    hasEnumerations: signals.enumerationCount >= 3,
    signals,
  };
}

/**
 * Aggregate capabilities from multiple chunks.
 */
export function aggregateCapabilities(
  chunks: Array<{ text: string; structure?: ChunkStructure }>
): DocumentCapabilities {
  const allText = chunks.map(c => c.text).join('\n');
  const baseCapabilities = inferCapabilities(allText);

  // Also use structure signals
  let tableCount = 0;
  let enumCount = 0;

  for (const chunk of chunks) {
    if (chunk.structure?.isTable) tableCount++;
    if (chunk.structure?.isEnumerated) enumCount++;
  }

  // Override with structure-based signals if stronger
  if (tableCount >= 2) baseCapabilities.hasTables = true;
  if (enumCount >= 3) baseCapabilities.hasEnumerations = true;

  return baseCapabilities;
}

// QUESTION-CAPABILITY MATCHING

export interface QuestionRequirement {
  requiresPeople: boolean;
  requiresBudgets: boolean;
  /**
   * Question asks about "current" state.
   * NOTE: We can only provide temporal CONTEXT from docs, not real-time data.
   */
  requiresTemporalContext: boolean;
  requiresOrgStructure: boolean;
  requiresDates: boolean;
  requiresProcedures: boolean;
}

/**
 * Detect what capabilities a question requires.
 */
export function detectQuestionRequirements(question: string): QuestionRequirement {
  const q = question.toLowerCase();

  return {
    requiresPeople: /(?:quién|who|persona|responsable|encargado|director|jefe)/i.test(q),
    requiresBudgets: /(?:cuánto|how much|costo|precio|presupuesto|monto|budget|cost)/i.test(q),
    requiresTemporalContext: /(?:actualmente|currently|ahora|hoy|vigente|actual)/i.test(q),
    requiresOrgStructure: /(?:departamento|área|dirección|secretaría|unidad|department|division)/i.test(q),
    requiresDates: /(?:cuándo|when|fecha|plazo|deadline|vencimiento)/i.test(q),
    requiresProcedures: /(?:cómo|how to|pasos|steps|procedimiento|proceso)/i.test(q),
  };
}

/**
 * Check if a document's capabilities can satisfy a question's requirements.
 * Returns null if satisfiable, or a string explaining what's missing.
 */
export function checkCapabilityMatch(
  capabilities: DocumentCapabilities,
  requirements: QuestionRequirement
): string | null {
  const missing: string[] = [];

  if (requirements.requiresPeople && !capabilities.hasPeople) {
    missing.push("nombres de personas");
  }
  if (requirements.requiresBudgets && !capabilities.hasBudgets) {
    missing.push("información presupuestal");
  }
  // NOTE: We check for temporal context, but "actualmente" questions about
  // live data (exchange rates, current headcount) may still fail at generation time
  if (requirements.requiresTemporalContext && !capabilities.hasTemporalContext) {
    missing.push("contexto temporal reciente");
  }
  if (requirements.requiresDates && !capabilities.hasDates) {
    missing.push("fechas o plazos");
  }
  if (requirements.requiresProcedures && !capabilities.hasProcedures) {
    missing.push("procedimientos o pasos");
  }

  if (missing.length === 0) {
    return null;  // Satisfiable
  }

  return `El documento no contiene ${missing.join(", ")}.`;
}

/**
 * Pre-retrieval check: Can this question be answered by the available documents?
 *
 * @param question - User's question
 * @param capabilities - Aggregated capabilities from retrieved chunks
 * @returns null if answerable, or a refusal message if not
 */
export function preRetrievalCheck(
  question: string,
  capabilities: DocumentCapabilities
): string | null {
  const requirements = detectQuestionRequirements(question);
  return checkCapabilityMatch(capabilities, requirements);
}
