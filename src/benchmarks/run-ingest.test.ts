/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it } from 'vitest';
import * as dotenv from 'dotenv';
dotenv.config();

import { weaviateClient } from '@/lib/services/weaviate-client';
import { QnAChunker } from '@/lib/services/chunkers/qna-chunker';
import { SaptivaEmbedder } from '@/lib/services/embedders/saptiva-embedder';
import { readerFactory } from '@/lib/services/readers/reader-factory';
import fs from 'fs';
import path from 'path';

describe('Data Ingestion', () => {
  it('should ingest files from data folder', async () => {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) return;
    
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.pdf') || f.endsWith('.docx'));
    const embedder = new SaptivaEmbedder();
    const chunker = new QnAChunker(1200, 150);

    console.log(`
📥 Iniciando ingesta de ${files.length} archivos...
`);

    for (const fileName of files) {
      if (fileName.includes(':Zone.Identifier')) continue;

      const filePath = path.join(dataDir, fileName);
      const buffer = fs.readFileSync(filePath);
      const blob = new Blob([buffer]);
      const file = blob as unknown as File;
      Object.defineProperty(file, 'name', { value: fileName });

      try {
        const reader = readerFactory.getReader(file);
        const extracted = await reader.extract(file);
        const chunks = await chunker.chunk(extracted.content, { filename: fileName });
        
        const qnaChunks: any[] = [];
        const regularChunks: any[] = [];
        chunks.forEach((chunk, index) => {
          if (chunk.metadata?.isQAPair) qnaChunks.push({ chunk, index });
          else regularChunks.push({ chunk, index });
        });

        const allEmbeddings: any[] = new Array(chunks.length);
        if (regularChunks.length > 0) {
          const embs = await embedder.embedBatch(regularChunks.map(c => c.chunk.content));
          regularChunks.forEach((item, i) => { allEmbeddings[item.index] = embs[i]; });
        }
        if (qnaChunks.length > 0) {
          const embs = await embedder.embedBatchFull(qnaChunks.map(c => c.chunk.content));
          qnaChunks.forEach((item, i) => { allEmbeddings[item.index] = embs[i]; });
        }

        await weaviateClient.ensureBothCollectionsExist();
        await weaviateClient.deleteByFilter('sourceName', fileName);
        await weaviateClient.deleteByFilterQnA('sourceName', fileName);

        const buildObj = (c: any, i: number) => ({
          properties: {
            text: c.content,
            chunkIndex: i + 1,
            totalChunks: chunks.length,
            sourceName: fileName,
            userId: 'admin-benchmark',
            sourceNamespace: 'benchmarks',
            isQAPair: c.metadata?.isQAPair ?? false,
            questionText: c.metadata?.questionText ?? null,
          },
          vector: allEmbeddings[i].embedding,
        });

        const regObjs = regularChunks.map(item => buildObj(item.chunk, item.index));
        const qnaObjs = qnaChunks.map(item => buildObj(item.chunk, item.index));

        if (regObjs.length > 0) await weaviateClient.insertBatch(regObjs);
        if (qnaObjs.length > 0) await weaviateClient.insertBatchQnA(qnaObjs);
        
        console.log(`   ✅ ${fileName}: ${chunks.length} chunks.`);
      } catch (error) {
        console.error(`   ❌ Error ${fileName}:`, error);
      }
    }
  }, 300000);
});
