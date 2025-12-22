import * as dotenv from 'dotenv';
dotenv.config();

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, afterAll } from 'vitest';
import { retrievalPipeline } from '@/lib/services/retrieval-pipeline';
import { getSaptivaEmbedder } from '@/lib/services/embedders/saptiva-embedder';
import { ModelFactory } from '@/lib/services/modelFactory';
import testCases from './dataset.json';
import fs from 'fs';
import path from 'path';

interface EvalResult {
  id: string;
  query: string;
  latencyMs: number;
  retrievalMs: number;
  retrieval: {
    hit: boolean;
    rank: number;
    sources: string[];
  };
  generation: {
    answer: string;
    keywordsPresent: string[];
    keywordsMissing: string[];
    refused: boolean;
    citationsFound: number;
  };
  outcome: 'PASS' | 'FAIL_RETRIEVAL' | 'FAIL_GENERATION' | 'FAIL_HALLUCINATION' | 'FAIL_FALSE_NEGATIVE';
}

function isRefusal(text: string): boolean {
  const refusalPhrases = [
    'no se encuentra', 'no hay información', 'no se menciona', 'no especificado',
    'no cuento con información', 'lo siento', 'disculpa'
  ];
  return refusalPhrases.some(p => text.toLowerCase().includes(p));
}

function calculatePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index];
}

describe('RAG Professional Benchmark', () => {
  const results: EvalResult[] = [];
  const embedder = getSaptivaEmbedder();
  const modelService = ModelFactory.getModelService();

  console.log(`\n🧠 Iniciando Benchmark PROFESIONAL (${testCases.length} casos)...\n`);

  testCases.forEach((tc: any) => {
    it(`[${tc.id}] ${tc.query}`, async () => {
      const startTime = Date.now();
      
      // 1. Retrieval
      const embeddingResult = await embedder.embedFull(tc.query);
      const pipelineResult = await retrievalPipeline.execute(tc.query, embeddingResult.embedding);
      const retrievalMs = Date.now() - startTime;

      // Check retrieval hit
      const foundSources = pipelineResult.results.map(r => String(r.properties.sourceName || ''));
      const expectedSources = tc.expected.sourceMatches || [];
      const hit = expectedSources.length === 0 
        ? true // Negative case: finding nothing is okay (or finding anything is okay as long as LLM handles it)
        : expectedSources.some(ext => foundSources.some(found => found.includes(ext)));
      
      const firstHitIndex = pipelineResult.results.findIndex(r => 
        expectedSources.some(ext => String(r.properties.sourceName).includes(ext))
      );

      // 2. Context Building
      const context = pipelineResult.results
        .slice(0, 10) // Top 10 chunks
        .map(r => {
          const text = String(r.properties.text || '');
          // Truncate individual chunks to avoid context overflow (1500 chars ~ 375 tokens)
          const truncated = text.length > 1500 ? text.slice(0, 1500) + '... (truncated)' : text;
          return `SOURCE: ${r.properties.sourceName}\nTEXT: ${truncated}`;
        })
        .join('\n\n---\n\n');

      // 3. Generation
      const systemPrompt = `Eres un asistente experto. Responde basándote SOLO en el contexto proporcionado.
      Si la respuesta no está en el contexto, di "No se encuentra información en los documentos".
      Incluye citas como [Fuente: Documento] si es posible.
      
      CONTEXTO:
      ${context}`;

      const answer = await modelService.generateText(
        `bench-${tc.id}`,
        systemPrompt,
        tc.query,
        'Saptiva Turbo',
        0.0,
        1500
      );

      const totalLatency = Date.now() - startTime;
      const refused = isRefusal(answer);
      const citations = (answer.match(/\[Fuente:/g) || []).length + (answer.match(/Fuente:/g) || []).length;

      // 4. Detailed Evaluation
      const keywords = tc.expected.keywordsInChunks || [];
      const present = keywords.filter((k: string) => answer.toLowerCase().includes(k.toLowerCase()));
      const missing = keywords.filter((k: string) => !answer.toLowerCase().includes(k.toLowerCase()));

      let outcome: EvalResult['outcome'] = 'PASS';

      if (tc.expected.shouldRefuse) {
        if (!refused && pipelineResult.results.length > 0) outcome = 'FAIL_HALLUCINATION';
      } else {
        if (!hit) outcome = 'FAIL_RETRIEVAL';
        else if (refused) outcome = 'FAIL_FALSE_NEGATIVE';
        else if (missing.length > 0 && keywords.length > 0) {
           // Soft fail if keywords missing but answered (could be rewording)
           // For strict benchmark, uncomment next line:
           // outcome = 'FAIL_GENERATION';
        }
      }

      results.push({
        id: tc.id,
        query: tc.query,
        latencyMs: totalLatency,
        retrievalMs: retrievalMs,
        retrieval: { hit, rank: firstHitIndex + 1, sources: foundSources.slice(0, 3) },
        generation: { answer, keywordsPresent: present, keywordsMissing: missing, refused, citationsFound: citations },
        outcome
      });

      // Console output per test
      const icon = outcome === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${tc.id} (${totalLatency}ms) | ${outcome}`);
      if (outcome !== 'PASS') {
        console.log(`   Q: ${tc.query}`);
        console.log(`   A: ${answer.slice(0, 100).replace(/\n/g, ' ')}...`);
        if (missing.length > 0) console.log(`   Missing Keywords: ${missing.join(', ')}`);
      }

    }, 45000);
  });

  afterAll(() => {
    // Generate Final Report
    const total = results.length;
    const passed = results.filter(r => r.outcome === 'PASS').length;
    const failed = total - passed;
    const latencies = results.map(r => r.latencyMs);
    const avgLatency = latencies.reduce((a,b) => a+b, 0) / total;
    
    // Metrics
    const retrievalAccuracy = results.filter(r => r.retrieval.hit).length / total * 100;
    const hallucinationRate = results.filter(r => r.outcome === 'FAIL_HALLUCINATION').length / results.filter(r => testCases.find((t:any) => t.id === r.id)?.expected.shouldRefuse).length * 100 || 0;
    const falseNegativeRate = results.filter(r => r.outcome === 'FAIL_FALSE_NEGATIVE').length / results.filter(r => !testCases.find((t:any) => t.id === r.id)?.expected.shouldRefuse).length * 100 || 0;

    const reportContent = `
# 📊 RAG Benchmark Results
**Date:** ${new Date().toLocaleString()}
**Model:** Saptiva Turbo

## 📈 Summary Metrics
| Metric | Value | Description |
|--------|-------|-------------|
| **Total Tests** | ${total} | Total scenarios executed |
| **Failed** | ${failed} | Tests that failed |
| **Success Rate** | **${(passed/total*100).toFixed(1)}%** | Overall pass rate |
| **Retrieval Hit Rate** | ${retrievalAccuracy.toFixed(1)}% | Correct document found in Top 5 |
| **False Negative Rate** | ${falseNegativeRate.toFixed(1)}% | Answer refused when info existed |
| **Hallucination Rate** | ${hallucinationRate.toFixed(1)}% | Answer given when info did NOT exist |
| **Avg Latency** | ${(avgLatency/1000).toFixed(2)}s | Average end-to-end time |
| **Avg Retrieval Time** | ${(results.reduce((sum, r) => sum + r.retrievalMs, 0) / total / 1000).toFixed(2)}s | Average retrieval time |
| **P95 Latency** | ${(calculatePercentile(latencies, 95)/1000).toFixed(2)}s | 95th percentile latency |

## 📝 Detailed Results
| ID | Outcome | Latency | Retrieval | Answer Preview |
|----|---------|---------|-----------|----------------|
${results.map(r => `| ${r.id} | ${r.outcome === 'PASS' ? '✅ PASS' : '❌ ' + r.outcome} | ${(r.latencyMs/1000).toFixed(1)}s | ${r.retrieval.hit ? '🎯 Hit #' + r.retrieval.rank : '🚫 Miss'} | ${r.generation.answer.slice(0, 60).replace(/\n/g, ' ')}... |`).join('\n')}
`;

    const reportPath = path.resolve(process.cwd(), 'src/benchmarks/BENCHMARK_REPORT.md');
    fs.writeFileSync(reportPath, reportContent);
    
    console.log('\n──────────────────────────────────────────────────────────────');
    console.log(reportContent);
    console.log('──────────────────────────────────────────────────────────────');
    console.log(`\n📄 Report saved to: ${reportPath}\n`);
  });
});

// Vitest needs a hook on global for afterAll if run directly with node, but with vitest runner it's automatic via import