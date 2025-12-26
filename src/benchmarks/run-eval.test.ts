import { describe, it, beforeAll } from 'vitest';
import * as dotenv from 'dotenv';
dotenv.config();

import { retrievalPipeline } from '@/lib/services/retrieval-pipeline';
import { getSaptivaEmbedder } from '@/lib/services/embedders/saptiva-embedder';
import testCases from './dataset.json';
import { TestCase, BenchmarkResult } from './types';
import fs from 'fs';
import path from 'path';

// Este test NO es unitario, es un BENCHMARK de integración.
// Requiere Weaviate y la API de Saptiva funcionando.

describe('RAG System Benchmark', () => {
  const results: BenchmarkResult[] = [];
  const embedder = getSaptivaEmbedder();

  beforeAll(() => {
    console.log(`\n🚀 Iniciando Benchmark con ${testCases.length} casos de prueba...\n`);
  });

  // Ejecutamos cada caso del JSON
  testCases.forEach((tc: TestCase) => {
    it(`[${tc.id}] ${tc.query}`, async () => {
      const startTime = Date.now();
      
      // 1. Obtener Embedding
      const embeddingResult = await embedder.embedFull(tc.query);
      
      // 2. Ejecutar Pipeline de Recuperación
      const pipelineResult = await retrievalPipeline.execute(tc.query, embeddingResult.embedding);
      
      const latencyMs = Date.now() - startTime;
      const foundSources = pipelineResult.results.map(r => String(r.properties.sourceName || ''));
      
      // 3. Evaluación de Recuperación (Retrieval)
      const expectedSources = tc.expected.sourceMatches || [];
      const hitRate = expectedSources.length === 0 
        ? (pipelineResult.results.length === 0 || pipelineResult.results[0]?.score < 0.4) // Para negativos
        : expectedSources.some(ext => foundSources.some(found => found.toLowerCase().includes(ext.toLowerCase())));

      // MRR Calculation
      let mrr = 0;
      if (expectedSources.length > 0) {
        const firstHitIndex = pipelineResult.results.findIndex(r => 
          expectedSources.some(ext => String(r.properties.sourceName).toLowerCase().includes(ext.toLowerCase()))
        );
        if (firstHitIndex !== -1) {
          mrr = 1 / (firstHitIndex + 1);
        }
      }

      const success = tc.expected.shouldRefuse 
        ? (pipelineResult.results.length === 0 || pipelineResult.results[0]?.score < 0.4)
        : hitRate;

      const benchmarkResult: BenchmarkResult = {
        testId: tc.id,
        query: tc.query,
        retrieval: {
          foundSources: [...new Set(foundSources)],
          hitRate,
          mrr,
          totalChunks: pipelineResult.results.length
        },
        success,
        latencyMs
      };

      results.push(benchmarkResult);

      // Reporte visual rápido
      console.log(`${success ? '✅' : '❌'} ${tc.id}: ${tc.query.slice(0, 50)}... (${latencyMs}ms)`);
      if (!success) {
        console.log(`   Esperaba: ${expectedSources.join(', ')}`);
        console.log(`   Encontró: ${benchmarkResult.retrieval.foundSources.slice(0, 3).join(', ')}`);
      }
    });
  });

  // Al finalizar todos los tests, guardar reporte
  afterAll(() => {
    const total = results.length;
    const passed = results.filter(r => r.success).length;
    const avgLatency = results.reduce((a, b) => a + b.latencyMs, 0) / total;
    const avgMrr = results.reduce((a, b) => a + b.retrieval.mrr, 0) / total;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total,
        passed,
        failed: total - passed,
        accuracy: (passed / total * 100).toFixed(2) + '%',
        avgLatencyMs: avgLatency.toFixed(2),
        avgMrr: avgMrr.toFixed(4)
      },
      details: results
    };

    const reportPath = path.resolve(process.cwd(), 'src/benchmarks/last-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📊 REPORTE FINAL`);
    console.log(`──────────────────────────────────`);
    console.log(`Total Tests: ${total}`);
    console.log(`Pasados:     ${passed}`);
    console.log(`Precisión:   ${report.summary.accuracy}`);
    console.log(`Avg MRR:     ${report.summary.avgMrr}`);
    console.log(`Reporte guardado en: ${reportPath}\n`);
  });
});

function afterAll(fn: () => void) {
  // Vitest hook
  global.afterAll(fn);
}
