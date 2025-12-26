import { DocumentReader } from '@/lib/core/interfaces';
import { ExtractedDocument } from '@/lib/core/types';
import { sanitizeExtractedText } from '@/lib/utils/normalize';

/**
 * Fast PDF reader using mupdf for direct text extraction.
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
    // Dynamic import for ESM package
    const mupdf = await import('mupdf');

    const buffer = Buffer.from(await file.arrayBuffer());

    // Open PDF with mupdf
    const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
    const pageCount = doc.countPages();

    // Extract text from all pages
    const textParts: string[] = [];
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      const text = page.toStructuredText('preserve-whitespace').asText();
      textParts.push(text);
    }

    // Sanitize extracted text to remove problematic characters
    const cleanContent = sanitizeExtractedText(textParts.join('\n\n'));

    return {
      content: cleanContent,
      metadata: {
        filename: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadDate: new Date().toISOString(),
        userId: '',
        namespace: '',
        pageCount: pageCount,
      },
    };
  }

  getName(): string {
    return 'FastPdfReader';
  }
}
