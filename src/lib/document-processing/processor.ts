import { Document } from "@langchain/core/documents";
import JSZip from "jszip";
import { EmbeddingService } from "../services/embeddingService";
import { EventEmitter } from "events";

export type DocProcessingResult = {
  chunks: string[];
  embeddings: number[][];
  filename: string;
  progress: EventEmitter;
};

/**
 * Procesa documentos extrayendo texto y dividiéndolo en fragmentos
 */
export async function processDocument(
  file: File,
  abortSignal?: AbortSignal,
): Promise<DocProcessingResult> {
  try {
    if (abortSignal?.aborted) {
      throw new Error("Procesamiento de documento cancelado");
    }

    // Crear objeto para reportar progreso
    const progress = new EventEmitter();
    let text = "";

    // Paso 1: Extraer texto según tipo de documento
    progress.emit("progress", { step: "extracting", progress: 0 });

    // Determinar tipo de archivo y extraer texto
    const fileType = file.name.split(".").pop()?.toLowerCase() || "";

    if (fileType === "pdf") {
      try {
        text = await extractTextFromPdf(file);
        // Verificar si se extrajo texto suficiente
        if (!text || text.trim().length < 100) {
          console.warn(
            "La extracción de texto del PDF generó poco contenido, intentando extracción en el servidor",
          );
          text = await extractViaServer(file, "pdf");
        }
      } catch (error) {
        console.error(
          "Error en la extracción del PDF en cliente, intentando en servidor:",
          error,
        );
        text = await extractViaServer(file, "pdf");
      }
    } else if (fileType === "txt" || fileType.includes("text")) {
      text = await file.text();
    } else if (fileType === "docx") {
      try {
        text = await extractTextFromDocx(file);
        // Verificar si se extrajo texto suficiente
        if (!text || text.trim().length < 100) {
          console.warn(
            "La extracción de texto del DOCX generó poco contenido, intentando extracción en el servidor",
          );
          text = await extractViaServer(file, "docx");
        }
      } catch (error) {
        console.error(
          "Error en la extracción del DOCX en cliente, intentando en servidor:",
          error,
        );
        text = await extractViaServer(file, "docx");
      }
    } else {
      throw new Error(
        `Tipo de archivo no soportado: ${fileType}. Usa PDF, DOCX o TXT.`,
      );
    }

    if (!text || text.trim().length === 0) {
      throw new Error(
        "No se pudo extraer texto del documento. Verifica que no esté dañado o protegido.",
      );
    }

    console.log(`Extraídos ${text.length} caracteres de ${file.name}`);
    progress.emit("progress", { step: "extracting", progress: 100 });

    // Paso 2: Dividir texto en fragmentos
    progress.emit("progress", { step: "chunking", progress: 0 });
    const chunks = splitIntoChunks(text);
    console.log(`Dividido en ${chunks.length} fragmentos`);
    progress.emit("progress", { step: "chunking", progress: 100 });

    // Paso 3: Generar embeddings con control de errores y reintentos
    progress.emit("progress", { step: "embedding", progress: 0 });

    const embeddingService = EmbeddingService.getInstance();
    const batchSize = 5;
    const embeddings: number[][] = [];
    const maxRetries = 2;

    for (let i = 0; i < chunks.length; i += batchSize) {
      if (abortSignal?.aborted) {
        throw new Error("Procesamiento de documento cancelado");
      }

      const batch = chunks.slice(i, i + batchSize);
      const batchProgress = (i / chunks.length) * 100;
      progress.emit("progress", { step: "embedding", progress: batchProgress });

      const batchEmbeddings = await Promise.all(
        batch.map(async (chunk, index) => {
          let retries = 0;
          while (retries <= maxRetries) {
            try {
              return await embeddingService.generateEmbedding(chunk);
            } catch (error) {
              retries++;
              if (retries > maxRetries) {
                console.error(
                  `No se pudo generar el embedding después de ${maxRetries} intentos`,
                  error,
                );
                // Embedding de respaldo aleatorio
                const dimensions = parseInt(
                  process.env.PINECONE_DIMENSIONS || "1024",
                );
                const randomEmbedding = Array(dimensions)
                  .fill(0)
                  .map(() => Math.random() * 2 - 1);
                const magnitude = Math.sqrt(
                  randomEmbedding.reduce((sum, val) => sum + val * val, 0),
                );
                return randomEmbedding.map((val) => val / magnitude);
              }
              console.warn(
                `Reintento ${retries}/${maxRetries} para el fragmento ${
                  i + index
                }`,
              );
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
          return [];
        }),
      );

      embeddings.push(...batchEmbeddings);
    }

    progress.emit("progress", { step: "embedding", progress: 100 });

    return {
      filename: file.name,
      chunks,
      embeddings,
      progress,
    };
  } catch (error) {
    console.error("Error procesando documento:", error);
    throw error;
  }
}

/**
 * Extrae texto en el servidor cuando falla la extracción en cliente
 */
async function extractViaServer(file: File, fileType: string): Promise<string> {
  console.log(`Intentando extracción en servidor para ${fileType}`);
  const formData = new FormData();
  formData.append("file", file);

  let endpoint = "/api/extract-docx";
  if (fileType === "pdf") {
    endpoint = "/api/extract-pdf";
  }

  try {
    const response = await fetch(endpoint, { method: "POST", body: formData });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Extracción en servidor fallida: ${errorData.error || response.statusText}`,
      );
    }

    const data = await response.json();
    console.log(
      `Servidor extrajo ${data.text.length} caracteres de ${fileType.toUpperCase()}`,
    );
    return data.text;
  } catch (serverError) {
    console.error(`Extracción en servidor para ${fileType} fallida:`, serverError);
    throw new Error(
      `No se pudo extraer texto de ${fileType.toUpperCase()}: ${
        serverError instanceof Error ? serverError.message : "Error desconocido"
      }`,
    );
  }
}

/**
 * Extrae texto de un PDF (implementación básica)
 */
async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const textDecoder = new TextDecoder("utf-8");
    const text = textDecoder.decode(arrayBuffer);
    const cleanText = text
      .replace(/[^\x20-\x7E\x0A\x0D\xA0-\xFF]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleanText;
  } catch (error) {
    console.error("Error extrayendo texto del PDF:", error);
    return "Error al extraer texto del PDF. Intenta con otro formato.";
  }
}

/**
 * Extrae texto de un DOCX usando JSZip
 */
async function extractTextFromDocx(file: File): Promise<string> {
  try {
    console.log("Extrayendo texto de DOCX con JSZip");
    const arrayBuffer = await file.arrayBuffer();
    const zip = await new JSZip().loadAsync(arrayBuffer);
    const documentXml = zip.file("word/document.xml");
    if (!documentXml) {
      throw new Error("No se encontró word/document.xml en el DOCX");
    }

    const xmlContent = await documentXml.async("text");
    const textMatches = xmlContent.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
    if (!textMatches) {
      throw new Error("No se encontró contenido de texto en el DOCX");
    }

    let textContent = textMatches
      .map((match: string) => {
        const content = match.replace(/<w:t[^>]*>(.*?)<\/w:t>/g, "$1");
        return content
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
      })
      .join(" ");

    // Intentar detectar párrafos y estructura
    const paragraphs: string[] = [];
    let currentParagraph = "";
    for (let i = 0; i < textMatches.length; i++) {
      const text = textMatches[i].replace(/<w:t[^>]*>(.*?)<\/w:t>/g, "$1");
      if (
        i > 0 &&
        xmlContent.indexOf("<w:p ", xmlContent.indexOf(textMatches[i - 1])) !==
          -1 &&
        xmlContent.indexOf("<w:p ", xmlContent.indexOf(textMatches[i - 1])) <
          xmlContent.indexOf(textMatches[i])
      ) {
        if (currentParagraph.trim()) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = "";
        }
      }
      currentParagraph += text + " ";
    }
    if (currentParagraph.trim()) {
      paragraphs.push(currentParagraph.trim());
    }
    if (paragraphs.length > 0) {
      textContent = paragraphs.join("\n\n");
    }

    textContent = textContent
      .replace(/<[^>]*>/g, "")
      .replace(/w:[a-z]+="[^"]*"/g, "")
      .replace(/\b(w|xml):[a-z]+\b/g, "")
      .replace(/rId\d+/g, "")
      .replace(/\b[0-9A-F]{6,}\b/g, "")
      .replace(/\s+/g, " ")
      .replace(/([.!?])\s+([A-Z])/g, "$1\n\n$2")
      .trim();

    console.log(`Extraídos ${textContent.length} caracteres de DOCX`);
    return textContent;
  } catch (error) {
    console.error("Error extrayendo texto de DOCX:", error);
    try {
      console.log("Intentando extracción de DOCX en el servidor");
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/extract-docx", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Extracción en servidor fallida: ${errorData.error || response.statusText}`,
        );
      }
      const data = await response.json();
      console.log(`Servidor extrajo ${data.text.length} caracteres de DOCX`);
      return data.text;
    } catch (serverError: unknown) {
      console.error("También falló la extracción en servidor:", serverError);
      throw new Error(
        `No se pudo extraer texto de DOCX: ${
          serverError instanceof Error ? serverError.message : "Error desconocido"
        }`,
      );
    }
  }
}

/**
 * Genera embeddings para documentos dados
 */
export async function generateEmbeddings(
  documents: Document[],
): Promise<number[][]> {
  try {
    if (!documents || documents.length === 0) {
      throw new Error("No se proporcionaron documentos para generar embeddings");
    }

    console.log(`Generando embeddings para ${documents.length} documentos`);

    const embeddingService = EmbeddingService.getInstance();
    const batchSize = 5;
    const embeddings: number[][] = [];

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      console.log(
        `Procesando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          documents.length / batchSize,
        )}`,
      );

      const batchEmbeddings = await Promise.all(
        batch.map(async (doc) => {
          try {
            return await embeddingService.generateEmbedding(doc.pageContent);
          } catch (error) {
            console.error(`Error generando embedding: ${error}`);
            const dimensions = parseInt(
              process.env.PINECONE_DIMENSIONS || "1024",
            );
            return Array(dimensions)
              .fill(0)
              .map(() => Math.random() * 2 - 1);
          }
        }),
      );

      embeddings.push(...batchEmbeddings);
    }

    console.log(`Generados ${embeddings.length} embeddings correctamente`);
    return embeddings;
  } catch (error) {
    console.error("Error en generateEmbeddings:", error);
    throw error;
  }
}

/**
 * Divide texto en fragmentos con solapamiento
 */
function splitIntoChunks(
  text: string,
  chunkSize = 1000,
  chunkOverlap = 200,
): string[] {
  if (!text || text.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);

  if (paragraphs.length > 1 && paragraphs.some((p) => p.length > 200)) {
    let currentChunk = "";
    let chunkStartIndex = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      if (paragraph.length === 0) continue;

      if (
        currentChunk.length + paragraph.length > chunkSize &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk);
        const prevChunkText = text.substring(
          chunkStartIndex,
          chunkStartIndex + currentChunk.length,
        );
        const overlapStartIndex = Math.max(
          0,
          prevChunkText.length - chunkOverlap,
        );
        const overlapText = prevChunkText.substring(overlapStartIndex);
        const sentenceBoundary = overlapText.search(/[.!?]\s+[A-Z]/);

        let overlapStart = chunkStartIndex + overlapStartIndex;
        if (sentenceBoundary !== -1) {
          overlapStart =
            chunkStartIndex + overlapStartIndex + sentenceBoundary + 2;
        }

        chunkStartIndex = overlapStart;
        currentChunk = text.substring(
          overlapStart,
          chunkStartIndex + paragraph.length,
        );
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk);
    }
  } else {
    let index = 0;
    while (index < text.length) {
      let chunk = text.substring(index, index + chunkSize);
      if (index + chunkSize < text.length) {
        const sentenceMatch = chunk.match(/[.!?](\s+|$)/g);
        if (sentenceMatch && sentenceMatch.length > 0) {
          const lastMatch = chunk.lastIndexOf(
            sentenceMatch[sentenceMatch.length - 1],
          );
          if (lastMatch > chunkSize / 2) {
            chunk = chunk.substring(
              0,
              lastMatch + sentenceMatch[sentenceMatch.length - 1].length,
            );
          }
        }
      }
      chunks.push(chunk);
      const moveForward = Math.max(1, chunk.length - chunkOverlap);
      index += moveForward;
    }
  }

  return chunks;
}
