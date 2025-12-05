import { DocumentReader } from '@/lib/core/interfaces';
import { ExtractedDocument } from '@/lib/core/types';

/**
 * Plain text document reader.
 * Handles .txt, .md, .markdown, and .json files.
 */
export class TextReader implements DocumentReader {
  private supportedExtensions = ['.txt', '.md', '.markdown', '.json'];
  private supportedMimes = ['text/plain', 'application/json', 'text/markdown'];

  canHandle(file: File): boolean {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    return this.supportedMimes.includes(file.type) || this.supportedExtensions.includes(extension);
  }

  getSupportedExtensions(): string[] {
    return this.supportedExtensions;
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const buffer = await file.arrayBuffer();
    const content = new TextDecoder('utf-8').decode(buffer);

    return {
      content,
      metadata: {
        filename: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadDate: new Date().toISOString(),
        userId: '',
        namespace: '',
      },
    };
  }

  getName(): string {
    return 'TextReader';
  }
}
