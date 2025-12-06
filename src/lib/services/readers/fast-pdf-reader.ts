import { DocumentReader } from '@/lib/core/interfaces';
import { ExtractedDocument } from '@/lib/core/types';

/**
 * Fast PDF reader using direct text extraction.
 * Best for regular PDFs with selectable text.
 * For scanned/image PDFs, use OcrPdfReader instead.
 */
export class FastPdfReader implements DocumentReader {
  canHandle(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  getSupportedExtensions(): string[] {
    return ['.pdf', '.PDF'];
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await pdfParse(buffer);

    return {
      content: result.text,
      metadata: {
        filename: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadDate: new Date().toISOString(),
        userId: '',
        namespace: '',
        pageCount: result.numpages,
      },
    };
  }

  getName(): string {
    return 'FastPdfReader';
  }
}
