import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

/**
 * Endpoint API para extraer texto de archivos DOCX
 * Esto usa un enfoque del lado del servidor para un análisis más confiable de DOCX
 */
export async function POST(request: NextRequest) {
  try {
    // Obtener los datos del formulario de la solicitud
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 });
    }

    // Verificar si el archivo es un DOCX
    if (
      file.type !==
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return NextResponse.json(
        { error: "El archivo no es un documento DOCX" },
        { status: 400 },
      );
    }

    // Extraer texto del archivo DOCX
    const text = await extractTextFromDocx(file);

    return NextResponse.json({
      success: true,
      text,
      filename: file.name,
      size: file.size,
    });
  } catch (error) {
    console.error("Error al extraer texto de DOCX:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
}

/**
 * Función del lado del servidor para extraer texto de archivos DOCX
 */
async function extractTextFromDocx(file: File): Promise<string> {
  try {
    // Convertir el archivo a buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Crear un archivo temporal
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `docx-${Date.now()}.docx`);

    // Escribir el buffer en el archivo temporal
    fs.writeFileSync(tempFilePath, buffer);

    // Procesar DOCX con librerías externas
    // Tenemos tres enfoques posibles:

    // Opción 1: Usar mammoth.js si está disponible
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ path: tempFilePath });

      // Eliminar archivo temporal
      fs.unlinkSync(tempFilePath);

      return result.value;
    } catch (mammothError) {
      console.error("Error usando mammoth.js:", mammothError);

      // Opción 2: Usar la librería docx-parser
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { DocxParser } = require("docx-parser");
        const parser = new DocxParser();
        const text = parser.parseDocx(tempFilePath);

        // Eliminar archivo temporal
        fs.unlinkSync(tempFilePath);

        return text;
      } catch (docxParserError) {
        console.error("Error usando docx-parser:", docxParserError);

        // Opción 3: Usar extracción simple desde XML
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const AdmZip = require("adm-zip");
          const zip = new AdmZip(tempFilePath);
          const contentXml = zip.getEntry("word/document.xml");

          if (!contentXml) {
            throw new Error("No se encontró document.xml en el archivo DOCX");
          }

          const content = contentXml.getData().toString("utf8");

          // Extraer texto usando regex desde el XML
          // No es lo ideal, pero funciona como último recurso
          const textContent = content
            .replace(/<[^>]+>/g, " ") // Quitar etiquetas XML
            .replace(/\s+/g, " ") // Normalizar espacios
            .trim();

          // Eliminar archivo temporal
          fs.unlinkSync(tempFilePath);

          return textContent;
        } catch (zipError) {
          console.error("Error usando adm-zip:", zipError);

          // Último recurso: Usar pandoc si está instalado en el servidor
          try {
            const text = execSync(`pandoc -f docx -t plain ${tempFilePath}`, {
              encoding: "utf8",
              maxBuffer: 10 * 1024 * 1024, // 10MB de buffer para archivos grandes
            });

            // Eliminar archivo temporal
            fs.unlinkSync(tempFilePath);

            return text;
          } catch (pandocError) {
            console.error("Error usando pandoc:", pandocError);

            // Eliminar archivo temporal antes de fallar
            fs.unlinkSync(tempFilePath);

            throw new Error("Todos los métodos de análisis DOCX fallaron");
          }
        }
      }
    }
  } catch (error) {
    console.error("Error en extractTextFromDocx:", error);
    return `Error al extraer texto del documento: ${
      error instanceof Error ? error.message : "Error desconocido"
    }`;
  }
}
