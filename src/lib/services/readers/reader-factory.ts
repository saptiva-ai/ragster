import { DocumentReader } from '@/lib/core/interfaces';
import { PdfReader } from './pdf-reader';
import { DocxReader } from './docx-reader';
import { TextReader } from './text-reader';
import { ImageReader } from './image-reader';

/**
 * Factory for document readers.
 * Automatically selects the appropriate reader based on file type.
 */
class ReaderFactory {
  private readers: DocumentReader[] = [];

  constructor() {
    // Register all available readers
    this.readers = [
      new PdfReader(),
      new DocxReader(),
      new ImageReader(),
      new TextReader(), // TextReader last as fallback for text-like files
    ];
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
}

// Singleton instance
export const readerFactory = new ReaderFactory();

// Also export the class for testing
export { ReaderFactory };
