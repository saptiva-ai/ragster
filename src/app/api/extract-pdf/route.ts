import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

/**
 * Endpoint API para extraer texto de archivos PDF
 * Esto utiliza un enfoque del lado del servidor para un análisis más confiable de PDF
 */
export async function POST(request: NextRequest) {
  try {
    // Obtener los datos del formulario de la solicitud
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 });
    }

    // Verificar si el archivo es un PDF
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "El archivo no es un documento PDF" },
        { status: 400 },
      );
    }

    // Extraer texto del archivo PDF
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
      { status: 500 },
    );
  }
}

/**
 * Función del lado del servidor para extraer texto de archivos PDF
 */
async function extractTextFromPdf(file: File): Promise<string> {
  try {
    // Convertir el archivo a buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Crear un archivo temporal
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `pdf-${Date.now()}.pdf`);

    // Escribir el buffer en el archivo temporal
    fs.writeFileSync(tempFilePath, buffer);

    // Procesar PDF con librerías externas
    // Tenemos varios enfoques que podemos intentar:

    // Opción 1: Usar pdf-parse si está disponible
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);

      // Eliminar el archivo temporal
      fs.unlinkSync(tempFilePath);

      // Obtener el contenido de texto
      return data.text;
    } catch (pdfParseError) {
      console.error("Error usando pdf-parse:", pdfParseError);

      // Opción 2: Intentar usando pdf2json
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const PDFParser = require("pdf2json");
        const parser = new PDFParser();

        const pdfData = await new Promise<{
          Pages?: Array<{
            Texts?: Array<{
              R?: Array<{
                T: string;
              }>;
            }>;
          }>;
        }>((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parser.on("pdfParser_dataReady", (data: any) => resolve(data));
          parser.on("pdfParser_dataError", (error: Error) => reject(error));
          parser.loadPDF(tempFilePath);
        });

        // Extraer texto desde el formato JSON
        let text = "";
        if (pdfData && pdfData.Pages) {
          for (const page of pdfData.Pages) {
            if (page.Texts) {
              for (const textItem of page.Texts) {
                if (textItem.R) {
                  for (const r of textItem.R) {
                    text += decodeURIComponent(r.T) + " ";
                  }
                }
              }
              text += "\n\n"; // Agregar saltos de párrafo entre páginas
            }
          }
        }

        // Eliminar el archivo temporal
        fs.unlinkSync(tempFilePath);

        return text;
      } catch (pdf2jsonError) {
        console.error("Error usando pdf2json:", pdf2jsonError);

        // Opción 3: Intentar usando pdfjs-dist como último recurso
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

          // Configurar la ruta del worker
          pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
            "pdfjs-dist/legacy/build/pdf.worker.js",
          );

          // Cargar el archivo PDF
          const loadingTask = pdfjsLib.getDocument({ data: buffer });
          const pdf = await loadingTask.promise;

          let text = "";

          // Extraer texto de cada página
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();

            // Unir todos los elementos y agregar un salto de página
            const pageText = content.items
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((item: any) => item.str)
              .join(" ");
            text += pageText + "\n\n";
          }

          // Eliminar el archivo temporal
          fs.unlinkSync(tempFilePath);

          return text;
        } catch (pdfjsError) {
          console.error("Error usando pdfjs:", pdfjsError);

          // Recurso final: Intentar usar pdftotext si está instalado en el servidor
          try {
            const text = execSync(`pdftotext -layout "${tempFilePath}" -`, {
              encoding: "utf8",
              maxBuffer: 10 * 1024 * 1024, // Buffer de 10MB para archivos grandes
            });

            // Eliminar el archivo temporal
            fs.unlinkSync(tempFilePath);

            return text;
          } catch (pdftotextError) {
            console.error("Error usando pdftotext:", pdftotextError);

            // Eliminar el archivo temporal antes de fallar
            fs.unlinkSync(tempFilePath);

            throw new Error("Todos los métodos de análisis de PDF fallaron");
          }
        }
      }
    }
  } catch (error) {
    console.error("Error en extractTextFromPdf:", error);
    return `Error al extraer texto de PDF: ${
      error instanceof Error ? error.message : "Error desconocido"
    }`;
  }
}
