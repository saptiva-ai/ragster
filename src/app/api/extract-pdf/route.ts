import { NextRequest, NextResponse } from "next/server";
/**
 * Endpoint API para extraer texto de archivos PDF
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó ningún archivo" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "El archivo no es un documento PDF" },
        { status: 400 }
      );
    }

    // Extraer texto
    const text = await extractTextFromPdf(file);

    return NextResponse.json({
      success: true,
      text,
      filename: file.name,
      size: file.size,
    });
  } catch (error) {
    console.error("Error al extraer texto de PDF:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

/**
 * Función para extraer texto de PDF usando pdf-parse
 */
async function extractTextFromPdf(file: File): Promise<string> {
  // convertir el archivo a buffer
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // importar pdf-parse dinámicamente (ESM friendly en Next.js)
  const pdfParse = (await import("pdf-parse")).default;

  const data = await pdfParse(buffer);

  return data.text;
}
