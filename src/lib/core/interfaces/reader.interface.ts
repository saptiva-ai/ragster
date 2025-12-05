import { ExtractedDocument } from '../types/document.types';

export interface DocumentReader {
  /**
   * Check if this reader can handle the given file type
   */
  canHandle(file: File): boolean;

  /**
   * Supported file extensions (e.g., ['.pdf', '.PDF'])
   */
  getSupportedExtensions(): string[];

  /**
   * Extract text content from the file
   */
  extract(file: File): Promise<ExtractedDocument>;

  /**
   * Reader name for logging/debugging
   */
  getName(): string;
}
