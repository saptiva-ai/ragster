import { DocumentReader } from '@/lib/core/interfaces';
import { ExtractedDocument } from '@/lib/core/types';
import { SaptivaService } from '../saptiva';
import { pdfToImages } from '../pdfToImages';

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
    const images = await pdfToImages(buffer);
    const texts: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const imgSize = (images[i].length / 1024).toFixed(2);
      console.log(`[OCR] Processing page ${i + 1}/${images.length} - Size: ${imgSize} KB`);

      const start = Date.now();
      const text = await this.saptivaService.ocrImage(images[i], 'image/jpeg');
      const duration = Date.now() - start;

      console.log(`[OCR] Page ${i + 1} completed in ${duration}ms`);
      texts.push(text);
    }

    return {
      content: texts.join('\n\n'),
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
    return 'OcrPdfReader';
  }
}
