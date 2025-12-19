import { DocumentReader } from '@/lib/core/interfaces';
import { ExtractedDocument } from '@/lib/core/types';
import { SaptivaService } from '../saptiva';
import { pdfToImages } from '../pdfToImages';
import { sanitizeExtractedText } from '@/lib/utils/normalize';

/**
 * Progress callback for OCR extraction.
 * @param currentPage - Current page being processed (1-indexed)
 * @param totalPages - Total number of pages
 * @param percent - Overall progress percentage (0-100)
 */
export type OcrProgressCallback = (currentPage: number, totalPages: number, percent: number) => void;

/**
 * OCR-based PDF reader.
 * Converts PDF pages to images and uses OCR to extract text.
 * Best for scanned documents or complex PDFs with embedded images.
 * Slower than FastPdfReader but handles image-based content.
 */
export class OcrPdfReader implements DocumentReader {
  private saptivaService: SaptivaService;

  constructor() {
    this.saptivaService = new SaptivaService(
      process.env.SAPTIVA_API_KEY!,
      process.env.SAPTIVA_API_BASE_URL
    );
  }

  canHandle(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  getSupportedExtensions(): string[] {
    return ['.pdf', '.PDF'];
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const buffer = Buffer.from(await file.arrayBuffer());
    return this.extractFromBuffer(buffer, {
      filename: file.name,
      fileType: file.type,
      fileSize: file.size,
    });
  }

  /**
   * Extract text from a PDF buffer directly.
   * More efficient when you already have a Buffer (avoids Buffer → File → Buffer conversion).
   * @param onProgress - Optional callback for progress updates during OCR
   */
  async extractFromBuffer(
    buffer: Buffer,
    metadata: { filename: string; fileType: string; fileSize: number },
    onProgress?: OcrProgressCallback
  ): Promise<ExtractedDocument> {
    const images = await pdfToImages(buffer);
    const texts: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const imgSize = (images[i].length / 1024).toFixed(2);
      console.log(`[OCR] Processing page ${i + 1}/${images.length} - Size: ${imgSize} KB`);

      // Calculate progress: extraction is 10-30%, so each page adds progress within that range
      // Progress = 10 + (page / totalPages) * 20
      const percent = Math.round(10 + ((i + 1) / images.length) * 20);
      if (onProgress) {
        onProgress(i + 1, images.length, percent);
      }

      const start = Date.now();
      const text = await this.saptivaService.ocrImage(images[i], 'image/jpeg');
      const duration = Date.now() - start;

      console.log(`[OCR] Page ${i + 1} completed in ${duration}ms`);
      texts.push(text);
    }

    // Sanitize extracted text to remove problematic characters
    const cleanContent = sanitizeExtractedText(texts.join('\n\n'));

    return {
      content: cleanContent,
      metadata: {
        filename: metadata.filename,
        fileType: metadata.fileType,
        fileSize: metadata.fileSize,
        uploadDate: new Date().toISOString(),
        userId: '',
        namespace: '',
      },
    };
  }

  getName(): string {
    return 'OcrPdfReader';
  }
}
