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
    return this.extractFromBuffer(buffer, {
      filename: file.name,
      fileType: file.type,
      fileSize: file.size,
    });
  }

  /**
   * Extract text from an image buffer directly.
   * More efficient when you already have a Buffer.
   */
  async extractFromBuffer(
    buffer: Buffer,
    metadata: { filename: string; fileType: string; fileSize: number }
  ): Promise<ExtractedDocument> {
    const content = await this.saptivaService.ocrImage(buffer, metadata.fileType);

    return {
      content,
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
    return 'ImageReader';
  }
}
