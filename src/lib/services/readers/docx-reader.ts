import mammoth from 'mammoth';
import { DocumentReader } from '@/lib/core/interfaces';
import { ExtractedDocument } from '@/lib/core/types';

/**
 * DOCX document reader.
 * Extracts text from Microsoft Word documents using mammoth.
 */
export class DocxReader implements DocumentReader {
  canHandle(file: File): boolean {
    return (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.toLowerCase().endsWith('.docx')
    );
  }

  getSupportedExtensions(): string[] {
    return ['.docx', '.DOCX'];
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });

    return {
      content: result.value || '',
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
    return 'DocxReader';
  }
}
