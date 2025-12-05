import { DocumentReader } from '@/lib/core/interfaces';
import { ExtractedDocument } from '@/lib/core/types';
import { SaptivaService } from '../saptiva';

/**
 * Image document reader.
 * Uses OCR to extract text from images (PNG, JPG, JPEG, WebP).
 */
export class ImageReader implements DocumentReader {
  private saptivaService: SaptivaService;
  private supportedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

  constructor() {
    this.saptivaService = new SaptivaService(
      process.env.SAPTIVA_API_KEY!,
      process.env.SAPTIVA_API_BASE_URL
    );
  }

  canHandle(file: File): boolean {
    return this.supportedMimes.includes(file.type);
  }

  getSupportedExtensions(): string[] {
    return ['.png', '.jpg', '.jpeg', '.webp'];
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const buffer = Buffer.from(await file.arrayBuffer());
    const content = await this.saptivaService.ocrImage(buffer, file.type);

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
    return 'ImageReader';
  }
}
