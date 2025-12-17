/**
 * RAG Pipeline Logger
 *
 * Structured logging for RAG requests.
 * Every request reads like a story with chapters, not a stack trace.
 *
 * STAGES (canonical order):
 *   QUERY → CLASSIFY → RETRIEVE → FILTER → EXPAND → CONTEXT → EVIDENCE → GENERATE → RESPOND
 *
 * LOG LEVELS:
 *   INFO  = Stage START / END / SUMMARY only
 *   DEBUG = Per-chunk details (gated by DEBUG_RAG)
 *   WARN  = Budget hit, fallback, retry
 *   ERROR = Abort
 */

import crypto from 'crypto';

export type RAGStage =
  | 'QUERY'
  | 'CLASSIFY'
  | 'RETRIEVE'
  | 'FILTER'
  | 'EXPAND'
  | 'CONTEXT'
  | 'EVIDENCE'
  | 'GENERATE'
  | 'RESPOND'
  | 'SUMMARY';

export type LogLevel = 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';

interface StageData {
  // What came in
  input?: number | string;
  // What went out
  output?: number | string;
  // What changed
  added?: number;
  removed?: number;
  // Was a limit hit
  budget?: string;
  // Why this path was taken
  decision?: string;
  // Additional context
  [key: string]: unknown;
}

interface TraceSummary {
  traceId: string;
  query: string;
  stages: {
    retrieve?: { hits: number; sources: number };
    filter?: { input: number; output: number; enabled: boolean };
    expand?: { added: number; budget: string };
    context?: { chunks: number; tokens: number };
    evidence?: { level: string };
    generate?: { model: string; latencyMs: number };
  };
  status: 'ok' | 'refused' | 'error';
  totalLatencyMs: number;
}

class RAGLogger {
  private traceId: string = '';
  private startTime: number = 0;
  private debugEnabled: boolean = false;
  private summary: Partial<TraceSummary> = {};

  /**
   * Start a new trace for a RAG request.
   * Call this at the beginning of each request.
   */
  startTrace(query: string): string {
    this.traceId = crypto.randomUUID().slice(0, 8);
    this.startTime = Date.now();
    this.debugEnabled = process.env.DEBUG_RAG === 'true';
    this.summary = {
      traceId: this.traceId,
      query: query.substring(0, 50),
      stages: {},
      status: 'ok',
    };

    this.info('QUERY', { query: query.length > 80 ? query.substring(0, 80) + '...' : query });
    return this.traceId;
  }

  /**
   * Log at INFO level (stage summaries)
   */
  info(stage: RAGStage, data?: StageData): void {
    this.log('INFO', stage, data);
  }

  /**
   * Log at DEBUG level (per-chunk details, gated by DEBUG_RAG)
   */
  debug(stage: RAGStage, data?: StageData): void {
    if (this.debugEnabled) {
      this.log('DEBUG', stage, data);
    }
  }

  /**
   * Log at WARN level (budget hit, fallback, retry)
   */
  warn(stage: RAGStage, data?: StageData): void {
    this.log('WARN', stage, data);
  }

  /**
   * Log at ERROR level (abort)
   */
  error(stage: RAGStage, data?: StageData): void {
    this.log('ERROR', stage, data);
    this.summary.status = 'error';
  }

  /**
   * Log stage completion with standardized format.
   */
  private log(level: LogLevel, stage: RAGStage, data?: StageData): void {
    const prefix = `[RAG:${this.traceId}][${stage}]`;

    if (!data) {
      console.log(prefix);
      return;
    }

    // Build compact log line
    const parts: string[] = [];

    if (data.input !== undefined) parts.push(`in=${data.input}`);
    if (data.output !== undefined) parts.push(`out=${data.output}`);
    if (data.added !== undefined) parts.push(`+${data.added}`);
    if (data.removed !== undefined) parts.push(`-${data.removed}`);
    if (data.budget !== undefined) parts.push(`budget=${data.budget}`);
    if (data.decision !== undefined) parts.push(`→ ${data.decision}`);

    // Add any extra fields
    for (const [key, value] of Object.entries(data)) {
      if (!['input', 'output', 'added', 'removed', 'budget', 'decision'].includes(key)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          parts.push(`${key}=${value}`);
        }
      }
    }

    const message = parts.length > 0 ? parts.join(' ') : '';

    if (level === 'WARN') {
      console.warn(`${prefix} ${message}`);
    } else if (level === 'ERROR') {
      console.error(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  // ============================================
  // STAGE-SPECIFIC HELPERS
  // ============================================

  classify(type: string, alpha?: number): void {
    this.info('CLASSIFY', {
      type,
      ...(alpha !== undefined && { alpha: alpha.toFixed(2) })
    });
  }

  retrieve(hits: number, sources: number): void {
    this.info('RETRIEVE', { hits, sources });
    this.summary.stages!.retrieve = { hits, sources };
  }

  filter(input: number, output: number, enabled: boolean): void {
    if (!enabled) {
      this.info('FILTER', { decision: 'disabled passthrough' });
    } else {
      this.info('FILTER', { input, output, removed: input - output });
    }
    this.summary.stages!.filter = { input, output, enabled };
  }

  expand(input: number, added: number, budgetUsed: number, budgetMax: number): void {
    const budgetStr = `${budgetUsed}/${budgetMax}`;
    this.info('EXPAND', {
      input,
      added,
      output: input + added,
      budget: budgetStr,
    });
    this.summary.stages!.expand = { added, budget: budgetStr };
  }

  context(chunks: number, tokens: number, retrieved: number, expanded: number): void {
    this.info('CONTEXT', {
      chunks,
      tokens,
      retrieved,
      expanded,
    });
    this.summary.stages!.context = { chunks, tokens };
  }

  evidence(level: string): void {
    this.info('EVIDENCE', { level });
    this.summary.stages!.evidence = { level };
  }

  generate(model: string, latencyMs: number): void {
    this.info('GENERATE', { model, latencyMs: `${latencyMs}ms` });
    this.summary.stages!.generate = { model, latencyMs };
  }

  refuse(reason: string): void {
    this.info('RESPOND', { decision: `REFUSED: ${reason}` });
    this.summary.status = 'refused';
  }

  /**
   * End the trace with a summary line.
   * Call this at the end of each request.
   */
  endTrace(): TraceSummary {
    const totalLatencyMs = Date.now() - this.startTime;
    this.summary.totalLatencyMs = totalLatencyMs;

    // Build one-line summary
    const s = this.summary.stages!;
    const parts: string[] = [];

    if (s.retrieve) parts.push(`retrieve=${s.retrieve.hits}`);
    if (s.filter) parts.push(`filter=${s.filter.output}`);
    if (s.expand) parts.push(`expand=+${s.expand.added}`);
    if (s.context) parts.push(`context=${s.context.chunks}`);
    if (s.evidence) parts.push(`evidence=${s.evidence.level}`);
    if (s.context) parts.push(`tokens=${s.context.tokens}`);
    parts.push(`latency=${totalLatencyMs}ms`);

    const prefix = `[RAG:${this.traceId}][SUMMARY]`;
    console.log(`${prefix} ${parts.join(' | ')} → ${this.summary.status}`);

    return this.summary as TraceSummary;
  }

  /**
   * Debug helper: log chunk details (only when DEBUG_RAG=true)
   */
  debugChunk(stage: RAGStage, chunk: {
    id: string;
    score?: number;
    kind?: 'retrieved' | 'expanded';
    preview?: string;
  }): void {
    if (this.debugEnabled) {
      const parts = [`chunk=${chunk.id}`];
      if (chunk.score !== undefined) parts.push(`score=${chunk.score.toFixed(3)}`);
      if (chunk.kind) parts.push(`kind=${chunk.kind}`);
      if (chunk.preview) parts.push(`"${chunk.preview.substring(0, 40)}..."`);

      console.log(`[RAG:${this.traceId}][${stage}] ${parts.join(' ')}`);
    }
  }

  /**
   * Debug helper: log all chunks with full text (DEBUG_RAG_FULL=true)
   */
  debugChunks(stage: RAGStage, label: string, chunks: Array<{
    properties: Record<string, unknown>;
    score?: number;
    _finalScore?: number;
    _isWindowExpansion?: boolean;
  }>): void {
    if (!this.debugEnabled) return;

    const showFullText = process.env.DEBUG_RAG_FULL === 'true';
    const totalChars = chunks.reduce((sum, c) => sum + String(c.properties.text || '').length, 0);

    console.log(`[RAG:${this.traceId}][${stage}] ${label}: ${chunks.length} chunks, ${totalChars} chars`);

    chunks.forEach((c, i) => {
      const text = String(c.properties.text || '');
      const source = String(c.properties.sourceName || 'unknown');
      const chunkIdx = c.properties.chunkIndex ?? '?';
      const score = c.score ?? c._finalScore ?? 0;
      const kind = c._isWindowExpansion ? 'expanded' : 'retrieved';

      console.log(`  [${i}] ${source}:${chunkIdx} | score=${score.toFixed(3)} | ${kind} | ${text.length} chars`);

      if (showFullText) {
        console.log(`  TEXT: "${text}"`);
        console.log(`  ---`);
      } else {
        const preview = text.substring(0, 150).replace(/\n/g, ' ');
        console.log(`  "${preview}..."`);
      }
    });
  }

  /**
   * Get current trace ID
   */
  getTraceId(): string {
    return this.traceId;
  }
}

// Export singleton for use across the request
// Note: In production, you'd want per-request instances via AsyncLocalStorage
export const ragLog = new RAGLogger();

// Also export class for creating per-request instances
export { RAGLogger };
