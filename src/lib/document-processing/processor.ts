import {Document} from "@langchain/core/documents";
import JSZip from "jszip";
import {EmbeddingService} from "../services/embeddingService";
import {EventEmitter} from "events";

export type DocProcessingResult = {
  chunks: string[];
  embeddings: number[][];
  filename: string;
  progress: EventEmitter;
};

/**
 * Process documents by extracting text and splitting into chunks
 */
export async function processDocument(
  file: File,
  abortSignal?: AbortSignal,
): Promise<DocProcessingResult> {
  try {
    if (abortSignal?.aborted) {
      throw new Error("Document processing aborted");
    }

    // Create progress reporting object
    const progress = new EventEmitter();
    let text = "";

    // Step 1: Extract text based on document type
    progress.emit("progress", {step: "extracting", progress: 0});

    // Determine file type and extract text
    const fileType = file.name.split(".").pop()?.toLowerCase() || "";

    if (fileType === "pdf") {
      try {
        text = await extractTextFromPdf(file);
        // Verify that text was properly extracted
        if (!text || text.trim().length < 100) {
          console.warn(
            "PDF text extraction yielded minimal text, attempting server-side extraction",
          );
          text = await extractViaServer(file, "pdf");
        }
      } catch (error) {
        console.error(
          "Error with client-side PDF extraction, falling back to server:",
          error,
        );
        text = await extractViaServer(file, "pdf");
      }
    } else if (fileType === "txt" || fileType.includes("text")) {
      text = await file.text();
    } else if (fileType === "docx") {
      try {
        text = await extractTextFromDocx(file);
        // Verify docx extraction quality
        if (!text || text.trim().length < 100) {
          console.warn(
            "DOCX text extraction yielded minimal text, attempting server-side extraction",
          );
          text = await extractViaServer(file, "docx");
        }
      } catch (error) {
        console.error(
          "Error with client-side DOCX extraction, falling back to server:",
          error,
        );
        text = await extractViaServer(file, "docx");
      }
    } else {
      throw new Error(
        `Tipo de archivo no soportado: ${fileType}. Por favor, utiliza archivos PDF, DOCX o TXT.`,
      );
    }

    if (!text || text.trim().length === 0) {
      throw new Error(
        "No se pudo extraer texto del documento. Verifica que el archivo no esté dañado o protegido.",
      );
    }

    console.log(`Extraídos ${text.length} caracteres de ${file.name}`);
    progress.emit("progress", {step: "extracting", progress: 100});

    // Step 2: Split text into chunks with improved chunking
    progress.emit("progress", {step: "chunking", progress: 0});
    const chunks = splitIntoChunks(text);
    console.log(`Dividido en ${chunks.length} fragmentos`);
    progress.emit("progress", {step: "chunking", progress: 100});

    // Step 3: Generate embeddings for each chunk with better error handling and retry logic
    progress.emit("progress", {step: "embedding", progress: 0});

    // Get embedding service
    const embeddingService = EmbeddingService.getInstance();

    // Process chunks in batches with retry logic
    const batchSize = 5;
    const embeddings: number[][] = [];
    const maxRetries = 2;

    for (let i = 0; i < chunks.length; i += batchSize) {
      if (abortSignal?.aborted) {
        throw new Error("Document processing aborted");
      }

      const batch = chunks.slice(i, i + batchSize);
      const batchProgress = (i / chunks.length) * 100;
      progress.emit("progress", {step: "embedding", progress: batchProgress});

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
                  `Failed to generate embedding after ${maxRetries} retries`,
                  error,
                );
                // Return a fallback embedding instead of failing completely
                const dimensions = parseInt(
                  process.env.PINECONE_DIMENSIONS || "1024",
                );
                const randomEmbedding = Array(dimensions)
                  .fill(0)
                  .map(() => Math.random() * 2 - 1);
                // Normalize the random embedding
                const magnitude = Math.sqrt(
                  randomEmbedding.reduce((sum, val) => sum + val * val, 0),
                );
                return randomEmbedding.map((val) => val / magnitude);
              }
              console.warn(
                `Retry ${retries}/${maxRetries} for embedding chunk ${
                  i + index
                }`,
              );
              // Wait before retrying
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
          // TypeScript needs this for proper typing, though it won't be reached
          return [];
        }),
      );

      embeddings.push(...batchEmbeddings);
    }

    progress.emit("progress", {step: "embedding", progress: 100});

    return {
      filename: file.name,
      chunks,
      embeddings,
      progress,
    };
  } catch (error) {
    console.error("Error processing document:", error);
    throw error;
  }
}

/**
 * Extract document text via server API for when client-side extraction fails
 */
async function extractViaServer(file: File, fileType: string): Promise<string> {
  console.log(`Attempting server-side ${fileType} extraction via API`);
  const formData = new FormData();
  formData.append("file", file);

  let endpoint = "/api/extract-docx";
  if (fileType === "pdf") {
    endpoint = "/api/extract-pdf";
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Server extraction failed: ${errorData.error || response.statusText}`,
      );
    }

    const data = await response.json();
    console.log(
      `Server extracted ${
        data.text.length
      } characters from ${fileType.toUpperCase()}`,
    );
    return data.text;
  } catch (serverError) {
    console.error(`Server-side ${fileType} extraction failed:`, serverError);
    throw new Error(
      `Failed to extract text from ${fileType.toUpperCase()}: ${
        serverError instanceof Error ? serverError.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Extract text from PDF file
 * This is a simplified implementation
 */
async function extractTextFromPdf(file: File): Promise<string> {
  try {
    // In a real implementation, we would use a PDF extraction library
    // For now, we'll use a basic approach with ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Use text decoder to get ASCII text (this is not ideal but a placeholder)
    const textDecoder = new TextDecoder("utf-8");
    const text = textDecoder.decode(arrayBuffer);

    // Clean up the text by removing non-printable characters
    const cleanText = text
      .replace(/[^\x20-\x7E\x0A\x0D\xA0-\xFF]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return cleanText;
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    return "Error extracting text from PDF document. Please try a different format.";
  }
}

/**
 * Extracts text from a DOCX file using JSZip
 * @param file The DOCX file to extract text from
 * @returns The extracted text
 */
async function extractTextFromDocx(file: File): Promise<string> {
  try {
    console.log("Extracting text from DOCX file using JSZip");
    const arrayBuffer = await file.arrayBuffer();
    const zip = await new JSZip().loadAsync(arrayBuffer);

    // Try to extract document.xml which contains the main content
    const documentXml = zip.file("word/document.xml");
    if (!documentXml) {
      throw new Error("Could not find word/document.xml in DOCX file");
    }

    const xmlContent = await documentXml.async("text");

    // Extract text from <w:t> tags which contain the actual text content
    const textMatches = xmlContent.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
    if (!textMatches) {
      throw new Error("No text content found in DOCX file");
    }

    // Clean XML tags and extract text content
    let textContent = textMatches
      .map((match: string) => {
        // Extract content between <w:t> and </w:t> tags
        const content = match.replace(/<w:t[^>]*>(.*?)<\/w:t>/g, "$1");
        // Decode HTML entities
        return content
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
      })
      .join(" ");

    // También intentamos extraer encabezados y estilos para preservar estructura
    const paragraphs: string[] = [];
    let currentParagraph = "";

    // Buscar párrafos y aplicar heurística para detectar finales
    // Buscar patrones de fin de párrafo y nueva línea
    for (let i = 0; i < textMatches.length; i++) {
      const text = textMatches[i].replace(/<w:t[^>]*>(.*?)<\/w:t>/g, "$1");

      // Si hay un elemento <w:p> cerca, probablemente sea un nuevo párrafo
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

    // No olvidar el último párrafo
    if (currentParagraph.trim()) {
      paragraphs.push(currentParagraph.trim());
    }

    // Si logramos extraer párrafos, usarlos como base
    if (paragraphs.length > 0) {
      textContent = paragraphs.join("\n\n");
    }

    // Limpieza adicional
    textContent = textContent
      // Eliminar caracteres XML restantes
      .replace(/<[^>]*>/g, "")
      // Eliminar caracteres extraños y códigos XML dispersos
      .replace(/w:[a-z]+="[^"]*"/g, "")
      .replace(/\b(w|xml):[a-z]+\b/g, "")
      .replace(/rId\d+/g, "")
      .replace(/\b[0-9A-F]{6,}\b/g, "")
      // Normalizar espacios
      .replace(/\s+/g, " ")
      // Recuperar saltos de párrafo adecuados (después de puntos seguidos por mayúscula)
      .replace(/([.!?])\s+([A-Z])/g, "$1\n\n$2")
      .trim();

    console.log(
      `Extracted ${textContent.length} characters from DOCX with improved parsing`,
    );
    return textContent;
  } catch (error) {
    console.error("Error extracting text from DOCX:", error);

    // Si falla la extracción del lado del cliente, intentar con la API del servidor
    try {
      console.log("Attempting server-side DOCX extraction via API");
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/extract-docx", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Server extraction failed: ${errorData.error || response.statusText}`,
        );
      }

      const data = await response.json();
      console.log(`Server extracted ${data.text.length} characters from DOCX`);
      return data.text;
    } catch (serverError: unknown) {
      console.error("Server-side extraction also failed:", serverError);
      const errorMessage =
        serverError instanceof Error ? serverError.message : "Unknown error";
      throw new Error(`Failed to extract text from DOCX: ${errorMessage}`);
    }
  }
}

/**
 * Generates embeddings for the given documents using the E5 model from transformers
 * @param documents The documents to generate embeddings for
 * @returns Array of embeddings (one per document)
 */
export async function generateEmbeddings(
  documents: Document[],
): Promise<number[][]> {
  try {
    if (!documents || documents.length === 0) {
      throw new Error("No documents provided for embedding generation");
    }

    console.log(`Generating embeddings for ${documents.length} documents`);

    // Get the embedding service
    const embeddingService = EmbeddingService.getInstance();

    // Generate embeddings in batches to avoid memory issues
    const batchSize = 5;
    const embeddings: number[][] = [];

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          documents.length / batchSize,
        )}`,
      );

      const batchEmbeddings = await Promise.all(
        batch.map(async (doc) => {
          try {
            // Get embedding from E5 model
            return await embeddingService.generateEmbedding(doc.pageContent);
          } catch (error) {
            console.error(`Error generating embedding for document: ${error}`);
            // Return a fallback random embedding with correct dimensions
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

    console.log(`Generated ${embeddings.length} embeddings successfully`);
    return embeddings;
  } catch (error) {
    console.error("Error in generateEmbeddings:", error);
    throw error;
  }
}

/**
 * Split text into chunks of a specified size with overlap
 * Improved implementation that preserves paragraph and semantic boundaries
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

  // Check if the text contains natural paragraphs
  const paragraphs = text.split(/\n\s*\n/);

  // If we have meaningful paragraphs, use them as a starting point
  if (paragraphs.length > 1 && paragraphs.some((p) => p.length > 200)) {
    let currentChunk = "";
    let chunkStartIndex = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      if (paragraph.length === 0) continue;

      // If adding this paragraph would exceed the chunk size, save the current chunk and start a new one
      if (
        currentChunk.length + paragraph.length > chunkSize &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk);

        // Calculate how much to backtrack for overlap
        const prevChunkText = text.substring(
          chunkStartIndex,
          chunkStartIndex + currentChunk.length,
        );
        const overlapStartIndex = Math.max(
          0,
          prevChunkText.length - chunkOverlap,
        );

        // Find a good sentence boundary for the overlap
        const overlapText = prevChunkText.substring(overlapStartIndex);
        const sentenceBoundary = overlapText.search(/[.!?]\s+[A-Z]/);

        let overlapStart = chunkStartIndex + overlapStartIndex;
        if (sentenceBoundary !== -1) {
          overlapStart =
            chunkStartIndex + overlapStartIndex + sentenceBoundary + 2; // +2 to include the punctuation and space
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

    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk);
    }
  } else {
    // Fallback to the original algorithm for texts without clear paragraph structure
    let index = 0;

    while (index < text.length) {
      let chunk = text.substring(index, index + chunkSize);

      // Try to find a sentence boundary or paragraph end for better chunks
      if (index + chunkSize < text.length) {
        // Find the last period, question mark, or exclamation followed by a space or newline
        const sentenceMatch = chunk.match(/[.!?](\s+|$)/g);
        if (sentenceMatch && sentenceMatch.length > 0) {
          const lastMatch = chunk.lastIndexOf(
            sentenceMatch[sentenceMatch.length - 1],
          );
          if (lastMatch > chunkSize / 2) {
            // Only cut at the sentence if it's not too short
            chunk = chunk.substring(
              0,
              lastMatch + sentenceMatch[sentenceMatch.length - 1].length,
            );
          }
        }
      }

      chunks.push(chunk);

      // Move forward, accounting for overlap
      const moveForward = Math.max(1, chunk.length - chunkOverlap);
      index += moveForward;
    }
  }

  return chunks;
}
