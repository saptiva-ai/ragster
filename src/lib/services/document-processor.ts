import { TextChunker, Embedder } from '@/lib/core/interfaces';
import { DocumentMetadata, ChunkWithEmbedding } from '@/lib/core/types';
import { readerFactory } from './readers/reader-factory';
import { RecursiveChunker } from './chunkers/recursive-chunker';
import { SentenceChunker } from './chunkers/sentence-chunker';
import { SaptivaEmbedder } from './embedders/saptiva-embedder';
import { getLanguageDetector } from './nlp/language-detector';

/**
 * Chunker type options.
 */
export type ChunkerType = 'recursive' | 'sentence';

/**
 * Options for document processing.
 */
export interface ProcessOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  chunkerType?: ChunkerType;
  sentencesPerChunk?: number;
  overlapSentences?: number;
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
    detectedLanguage: string;
    chunkerUsed: string;
  };
}

/**
 * Document processor service.
 * Orchestrates the full document processing pipeline:
 * 1. Read/extract text from file
 * 2. Detect language
 * 3. Chunk the text (using sentence boundaries)
 * 4. Generate embeddings for each chunk
 */
export class DocumentProcessor {
  private defaultChunker: TextChunker;
  private embedder: Embedder;

  constructor(chunker?: TextChunker, embedder?: Embedder) {
    this.defaultChunker = chunker || new RecursiveChunker();
    this.embedder = embedder || new SaptivaEmbedder();
  }

  /**
   * Get the appropriate chunker based on options.
   */
  private getChunkerForType(options: ProcessOptions): TextChunker {
    if (options.chunkerType === 'sentence') {
      return new SentenceChunker(
        options.sentencesPerChunk || 5,
        options.overlapSentences || 1
      );
    }
    return this.defaultChunker;
  }

  /**
   * Process a file through the full pipeline.
   * @param file - The file to process
   * @param metadata - Partial metadata (userId, namespace will be added)
   * @param options - Processing options (chunk size, overlap, chunker type)
   */
  async process(
    file: File,
    metadata: Partial<DocumentMetadata>,
    options: ProcessOptions = {}
  ): Promise<ProcessResult> {
    const startTime = Date.now();
    const fileSize = (file.size / 1024).toFixed(1);

    console.log(`[Processor] 📄 Starting: ${file.name} (${fileSize}KB)`);

    // 1. Get appropriate reader for this file type
    const reader = readerFactory.getReader(file);
    console.log(`[Processor] Step 1/4: Using reader ${reader.getName()}`);

    // 2. Extract text content from file
    const extractStart = Date.now();
    const extracted = await reader.extract(file);
    const extractTime = ((Date.now() - extractStart) / 1000).toFixed(1);
    console.log(`[Processor] Step 2/4: Extracted ${extracted.content.length} chars ✓ (${extractTime}s)`);

    // 3. Detect language
    const languageDetector = getLanguageDetector();
    const langResult = await languageDetector.detect(extracted.content);
    console.log(`[Processor] Language: ${langResult.language} (${(langResult.confidence * 100).toFixed(0)}% confidence)`);

    // 4. Get chunker and chunk the text
    const chunkStart = Date.now();
    const chunker = this.getChunkerForType(options);
    const chunks = await chunker.chunk(extracted.content, {
      chunkSize: options.chunkSize,
      chunkOverlap: options.chunkOverlap,
    });
    const chunkTime = ((Date.now() - chunkStart) / 1000).toFixed(1);
    console.log(`[Processor] Step 3/4: Created ${chunks.length} chunks ✓ (${chunkTime}s)`);

    // 5. Generate embeddings for each chunk
    console.log(`[Processor] Step 4/4: Generating ${chunks.length} embeddings...`);
    const embeddingResults = await this.embedder.embedBatch(
      chunks.map((c) => c.content)
    );

    // 6. Combine chunks with embeddings
    const chunksWithEmbeddings: ChunkWithEmbedding[] = chunks.map((chunk, i) => ({
      ...chunk,
      embedding: embeddingResults[i].embedding,
    }));

    // 7. Build complete metadata
    const completeMetadata: DocumentMetadata = {
      filename: file.name,
      fileType: file.type,
      fileSize: file.size,
      uploadDate: new Date().toISOString(),
      userId: metadata.userId || '',
      namespace: metadata.namespace || 'default',
      language: langResult.language,
    };

    const processingTimeMs = Date.now() - startTime;
    const totalSeconds = (processingTimeMs / 1000).toFixed(1);
    console.log(`[Processor] ✅ Complete: ${file.name} - ${chunks.length} chunks in ${totalSeconds}s`);

    return {
      chunks: chunksWithEmbeddings,
      metadata: completeMetadata,
      stats: {
        totalCharacters: extracted.content.length,
        totalChunks: chunks.length,
        processingTimeMs,
        detectedLanguage: langResult.language,
        chunkerUsed: chunker.getName(),
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
   * Get the default chunker.
   */
  getChunker(): TextChunker {
    return this.defaultChunker;
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
