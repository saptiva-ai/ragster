import { DocumentReader } from '@/lib/core/interfaces';
import { FastPdfReader } from './fast-pdf-reader';
import { OcrPdfReader } from './ocr-pdf-reader';
import { DocxReader } from './docx-reader';
import { TextReader } from './text-reader';
import { ImageReader } from './image-reader';

/**
 * Factory for document readers.
 * Automatically selects the appropriate reader based on file type.
 * Supports named reader selection for specific use cases (e.g., OCR).
 */
class ReaderFactory {
  private readers: DocumentReader[] = [];
  private namedReaders: Map<string, DocumentReader> = new Map();

  constructor() {
    // Register all available readers (FastPdfReader is default for PDFs)
    this.readers = [
      new FastPdfReader(),
      new DocxReader(),
      new ImageReader(),
      new TextReader(), // TextReader last as fallback for text-like files
    ];

    // Named readers for explicit selection
    this.namedReaders.set('FastPdfReader', new FastPdfReader());
    this.namedReaders.set('OcrPdfReader', new OcrPdfReader());
  }

  /**
   * Get the appropriate reader for a file.
   * @throws Error if no reader can handle the file type.
   */
  getReader(file: File): DocumentReader {
    const reader = this.readers.find((r) => r.canHandle(file));

    if (!reader) {
      throw new Error(`No reader available for file type: ${file.type} (${file.name})`);
    }

    return reader;
  }

  /**
   * Check if a file type is supported.
   */
  isSupported(file: File): boolean {
    return this.readers.some((r) => r.canHandle(file));
  }

  /**
   * Get all supported file extensions.
   */
  getSupportedExtensions(): string[] {
    return this.readers.flatMap((r) => r.getSupportedExtensions());
  }

  /**
   * Get list of all registered readers.
   */
  getReaders(): DocumentReader[] {
    return [...this.readers];
  }

  /**
   * Get a specific reader by name.
   * Useful for explicit reader selection (e.g., OCR mode).
   * @throws Error if reader name is not found.
   */
  getReaderByName(name: string): DocumentReader {
    const reader = this.namedReaders.get(name);
    if (!reader) {
      throw new Error(`Reader not found: ${name}. Available: ${Array.from(this.namedReaders.keys()).join(', ')}`);
    }
    return reader;
  }

  /**
   * Get list of available reader names.
   */
  getAvailableReaderNames(): string[] {
    return Array.from(this.namedReaders.keys());
  }
}

// Singleton instance
export const readerFactory = new ReaderFactory();

// Also export the class for testing
export { ReaderFactory };
