import { TextChunker, Embedder } from '@/lib/core/interfaces';
import { DocumentMetadata, ChunkWithEmbedding } from '@/lib/core/types';
import { readerFactory } from './readers/reader-factory';
import { RecursiveChunker } from './chunkers/recursive-chunker';
import { SaptivaEmbedder } from './embedders/saptiva-embedder';

/**
 * Options for document processing.
 */
export interface ProcessOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Result of document processing.
 */
export interface ProcessResult {
  chunks: ChunkWithEmbedding[];
  metadata: DocumentMetadata;
  stats: {
    totalCharacters: number;
    totalChunks: number;
    processingTimeMs: number;
  };
}

/**
 * Document processor service.
 * Orchestrates the full document processing pipeline:
 * 1. Read/extract text from file
 * 2. Chunk the text
 * 3. Generate embeddings for each chunk
 */
export class DocumentProcessor {
  private chunker: TextChunker;
  private embedder: Embedder;

  constructor(chunker?: TextChunker, embedder?: Embedder) {
    this.chunker = chunker || new RecursiveChunker();
    this.embedder = embedder || new SaptivaEmbedder();
  }

  /**
   * Process a file through the full pipeline.
   * @param file - The file to process
   * @param metadata - Partial metadata (userId, namespace will be added)
   * @param options - Processing options (chunk size, overlap)
   */
  async process(
    file: File,
    metadata: Partial<DocumentMetadata>,
    options: ProcessOptions = {}
  ): Promise<ProcessResult> {
    const startTime = Date.now();

    // 1. Get appropriate reader for this file type
    const reader = readerFactory.getReader(file);
    console.log(`[DocumentProcessor] Using reader: ${reader.getName()}`);

    // 2. Extract text content from file
    const extracted = await reader.extract(file);
    console.log(`[DocumentProcessor] Extracted ${extracted.content.length} characters`);

    // 3. Chunk the text
    const chunks = await this.chunker.chunk(extracted.content, {
      chunkSize: options.chunkSize,
      chunkOverlap: options.chunkOverlap,
    });
    console.log(`[DocumentProcessor] Created ${chunks.length} chunks using ${this.chunker.getName()}`);

    // 4. Generate embeddings for each chunk
    console.log(`[DocumentProcessor] Generating embeddings using ${this.embedder.getName()}...`);
    const embeddingResults = await this.embedder.embedBatch(
      chunks.map((c) => c.content)
    );

    // 5. Combine chunks with embeddings
    const chunksWithEmbeddings: ChunkWithEmbedding[] = chunks.map((chunk, i) => ({
      ...chunk,
      embedding: embeddingResults[i].embedding,
    }));

    // 6. Build complete metadata
    const completeMetadata: DocumentMetadata = {
      filename: file.name,
      fileType: file.type,
      fileSize: file.size,
      uploadDate: new Date().toISOString(),
      userId: metadata.userId || '',
      namespace: metadata.namespace || 'default',
      language: metadata.language,
    };

    const processingTimeMs = Date.now() - startTime;
    console.log(`[DocumentProcessor] Completed in ${processingTimeMs}ms`);

    return {
      chunks: chunksWithEmbeddings,
      metadata: completeMetadata,
      stats: {
        totalCharacters: extracted.content.length,
        totalChunks: chunks.length,
        processingTimeMs,
      },
    };
  }

  /**
   * Check if a file type is supported.
   */
  isFileSupported(file: File): boolean {
    return readerFactory.isSupported(file);
  }

  /**
   * Get all supported file extensions.
   */
  getSupportedExtensions(): string[] {
    return readerFactory.getSupportedExtensions();
  }

  /**
   * Get the current chunker.
   */
  getChunker(): TextChunker {
    return this.chunker;
  }

  /**
   * Get the current embedder.
   */
  getEmbedder(): Embedder {
    return this.embedder;
  }
}

// Singleton instance
let processorInstance: DocumentProcessor | null = null;

/**
 * Get the singleton DocumentProcessor instance.
 */
export function getDocumentProcessor(): DocumentProcessor {
  if (!processorInstance) {
    processorInstance = new DocumentProcessor();
  }
  return processorInstance;
}

/**
 * Create a new DocumentProcessor with custom components.
 */
export function createDocumentProcessor(
  chunker?: TextChunker,
  embedder?: Embedder
): DocumentProcessor {
  return new DocumentProcessor(chunker, embedder);
}
