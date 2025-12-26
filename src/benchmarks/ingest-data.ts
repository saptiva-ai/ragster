/* eslint-disable @typescript-eslint/no-explicit-any */
import { weaviateClient } from '@/lib/services/weaviate-client';
import { QnAChunker } from '@/lib/services/chunkers/qna-chunker';
import { SaptivaEmbedder } from '@/lib/services/embedders/saptiva-embedder';
import { readerFactory } from '@/lib/services/readers/reader-factory';
import fs from 'fs';
import path from 'path';

async function ingestFolder() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.pdf') || f.endsWith('.docx'));
  
  const embedder = new SaptivaEmbedder();
  const chunker = new QnAChunker(1200, 150);

  console.log(`
📥 Iniciando ingesta de ${files.length} archivos desde ${dataDir}...
`);

  for (const fileName of files) {
    if (fileName.includes(':Zone.Identifier')) continue;

    console.log(`Processing: ${fileName}`);
    const filePath = path.join(dataDir, fileName);
    const buffer = fs.readFileSync(filePath);
    
    // Simular objeto File para el reader factory
    const blob = new Blob([buffer], { type: fileName.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const file = blob as unknown as File;
    Object.defineProperty(file, 'name', { value: fileName });

    try {
      // 1. Extraer texto
      const reader = readerFactory.getReader(file);
      const extracted = await reader.extract(file);

      // 2. Chunking
      const chunks = await chunker.chunk(extracted.content, { filename: fileName });
      
      // 3. Separar QnA y regular
      const qnaChunks: any[] = [];
      const regularChunks: any[] = [];
      chunks.forEach((chunk, index) => {
        if (chunk.metadata?.isQAPair) qnaChunks.push({ chunk, index });
        else regularChunks.push({ chunk, index });
      });

      // 4. Embeddings
      const allEmbeddings: any[] = new Array(chunks.length);
      if (regularChunks.length > 0) {
        const embs = await embedder.embedBatch(regularChunks.map(c => c.chunk.content));
        regularChunks.forEach((item, i) => { allEmbeddings[item.index] = embs[i]; });
      }
      if (qnaChunks.length > 0) {
        const embs = await embedder.embedBatchFull(qnaChunks.map(c => c.chunk.content));
        qnaChunks.forEach((item, i) => { allEmbeddings[item.index] = embs[i]; });
      }

      // 5. Weaviate
      await weaviateClient.ensureBothCollectionsExist();
      await weaviateClient.deleteByFilter('sourceName', fileName);
      await weaviateClient.deleteByFilterQnA('sourceName', fileName);

      const buildObject = (chunk: any, index: number) => ({
        properties: {
          text: chunk.content,
          chunkIndex: index + 1,
          totalChunks: chunks.length,
          sourceName: fileName,
          userId: 'admin-benchmark',
          sourceNamespace: 'benchmarks',
          isQAPair: chunk.metadata?.isQAPair ?? false,
          questionText: chunk.metadata?.questionText ?? null,
        },
        vector: allEmbeddings[index].embedding,
      });

      const regularObjects = regularChunks.map(item => buildObject(item.chunk, item.index));
      const qnaObjects = qnaChunks.map(item => buildObject(item.chunk, item.index));

      if (regularObjects.length > 0) await weaviateClient.insertBatch(regularObjects);
      if (qnaObjects.length > 0) await weaviateClient.insertBatchQnA(qnaObjects);
      
      console.log(`   ✅ Ingestado correctamente: ${chunks.length} chunks.
`);
    } catch (error) {
      console.error(`   ❌ Error procesando ${fileName}:`, error);
    }
  }
}

ingestFolder().catch(console.error);
