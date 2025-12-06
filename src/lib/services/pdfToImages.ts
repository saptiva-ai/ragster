// Converts PDF buffer to array of JPEG buffers (one per page)
// Uses mupdf WASM - platform independent, works in Docker

const DPI = 300;
const SCALE = DPI / 72;

export async function pdfToImages(pdfBuffer: Buffer): Promise<Buffer[]> {
  const mupdf = await import("mupdf");

  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const pageCount = doc.countPages();
  const images: Buffer[] = [];

  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const pixmap = page.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceRGB);
    const jpeg = pixmap.asJPEG(85);
    images.push(Buffer.from(jpeg));
  }

  return images;
}
