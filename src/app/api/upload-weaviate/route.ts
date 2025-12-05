import { NextRequest, NextResponse } from "next/server";

// Force dynamic rendering to prevent build-time evaluation of WASM-based mupdf
export const dynamic = "force-dynamic";
import mammoth from "mammoth";
import weaviate, { WeaviateClient } from "weaviate-client";
import { connectToDatabase } from "@/lib/mongodb/client";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import axios from "axios";
import { MODEL_NAMES } from "@/config/models";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SaptivaService } from "@/lib/services/saptiva";
import { pdfToImages } from "@/lib/services/pdfToImages";

interface Chunk {
  text: string;
  id: string;
}

// Cliente Weaviate (lazy initialization)
let client: WeaviateClient | null = null;

async function getWeaviateClient(): Promise<WeaviateClient> {
  if (!client) {
    client = await weaviate.connectToWeaviateCloud(process.env.WEAVIATE_HOST!, {
      authCredentials: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY!),
    });
  }
  return client;
}

// Asegúrate que la clase existe en Weaviate
async function ensureWeaviateClassExists(className: string) {
  const weaviateClient = await getWeaviateClient();
  // 1. Listar todas las colecciones/clases
  const collections = await weaviateClient.collections.listAll();
  const exists = collections.some(
    (col: { name: string }) => col.name === className
  );

  if (!exists) {
    console.log(`La colección ${className} no existe. Creando...`);
    await weaviateClient.collections.create({
      name: className,
      vectorizers: [],
      properties: [
        { name: "text", dataType: "text" },
        { name: "sourceName", dataType: "text" },
        { name: "sourceType", dataType: "text" },
        { name: "sourceSize", dataType: "text" },
        { name: "uploadDate", dataType: "text" },
        { name: "chunkIndex", dataType: "int" },
        { name: "totalChunks", dataType: "int" },
        { name: "sourceNamespace", dataType: "text" },
        { name: "prevChunkIndex", dataType: "int" },
        { name: "nextChunkIndex", dataType: "int" },
        { name: "userId", dataType: "text" },
      ],
    });
    // Esperar a que la colección esté disponible (opcional: reintentos)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log(`Colección ${className} creada.`);
  } else {
    console.log(`La colección ${className} ya existe.`);
  }
}

// Image types that need OCR (PDF handled separately)
const OCR_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

// File types that are already text
const TEXT_MIMES = ["text/plain", "application/json", "text/markdown"];

// Extensions that should be treated as text (fallback when mime is octet-stream)
const TEXT_EXTENSIONS = [".txt", ".json", ".md", ".markdown"];

async function extractTextFromFile(
  buffer: ArrayBuffer,
  file: File
): Promise<string> {
  const mime = file.type;
  const nodeBuffer = Buffer.from(buffer);
  const fileName = file.name.toLowerCase();

  // Text files: direct read (check mime OR extension as fallback)
  const isTextByExtension = TEXT_EXTENSIONS.some((ext) =>
    fileName.endsWith(ext)
  );
  if (TEXT_MIMES.includes(mime) || isTextByExtension) {
    return new TextDecoder("utf-8").decode(buffer);
  }

  // DOCX: use mammoth
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer: nodeBuffer });
    return result.value || "";
  }

  // PDF: convert to images, OCR each page
  if (mime === "application/pdf") {
    const saptivaService = new SaptivaService(
      process.env.SAPTIVA_API_KEY!,
      process.env.SAPTIVA_API_BASE_URL
    );
    const images = await pdfToImages(nodeBuffer);
    const texts: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const imgSize = (images[i].length / 1024).toFixed(2);
      console.log(`Pagina ${i + 1}/${images.length} - Tamano: ${imgSize} KB`);

      const start = Date.now();
      const text = await saptivaService.ocrImage(images[i], "image/jpeg");
      const duration = Date.now() - start;

      console.log(`Pagina ${i + 1} completada en ${duration}ms`);
      texts.push(text);
    }

    return texts.join("\n\n");
  }

  // Images: use Saptiva OCR directly
  if (OCR_MIMES.includes(mime)) {
    const saptivaService = new SaptivaService(
      process.env.SAPTIVA_API_KEY!,
      process.env.SAPTIVA_API_BASE_URL
    );
    return await saptivaService.ocrImage(nodeBuffer, mime);
  }

  throw new Error(`Tipo de archivo no soportado: ${mime}`);
}

async function getCustomEmbedding(text: string): Promise<number[]> {
  const embeddingUrl = process.env.EMBEDDING_API_URL;
  if (!embeddingUrl) {
    throw new Error(
      "EMBEDDING_API_URL no esta definido en variables de entorno .env"
    );
  }

  try {
    // Fixed: Removed "stream: false" - SAPTIVA Embed API only accepts "model" and "prompt"
    const response = await axios.post(
      embeddingUrl,
      {
        model: MODEL_NAMES.EMBEDDING,
        prompt: text,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SAPTIVA_API_KEY}`,
        },
        timeout: 30000, // 30 segundos
      }
    );

    console.log("Embedding response:", response.data);

    if (
      !response.data ||
      !response.data.embeddings ||
      !Array.isArray(response.data.embeddings)
    ) {
      throw new Error("Invalid embedding response format");
    }

    return response.data.embeddings;
  } catch (error) {
    console.error("Error fetching embedding:", error);
    // Log the actual API error response for debugging
    if (axios.isAxiosError(error) && error.response) {
      console.error("API Error Response:", {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });
    }
    throw error;
  }
}

async function insertDataToWeaviate(
  chunks: Chunk[],
  filename: string,
  file: File,
  formNamespace: string,
  idUploadFile: import("mongodb").ObjectId,
  userId: string
): Promise<void> {
  const { db } = await connectToDatabase();
  const fileColection = db.collection("file");

  const enrichedChunks = await Promise.all(
    chunks.map(async (item, index) => {
      return {
        ...item,
        chunkIndex: index + 1,
        totalChunks: chunks.length,
        prevChunkIndex: index > 0 ? index : null,
        nextChunkIndex: index < chunks.length - 1 ? index + 2 : null,
        sourceName: filename,
        sourceType: file.type,
        sourceSize: file.size.toString(),
        uploadDate: new Date().toISOString(),
        sourceNamespace: formNamespace,
        userId: userId,
      };
    })
  );

  // Changed from Promise.all (parallel) to sequential processing
  // This prevents rate limiting by SAPTIVA API when processing multiple chunks
  const docsToInsert = [];

  for (let i = 0; i < enrichedChunks.length; i++) {
    const item = enrichedChunks[i];

    // Add 500ms delay between requests to avoid overwhelming the API
    // Skip delay for first chunk to start immediately
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Generate embedding for this chunk
    const embedding = await getCustomEmbedding(item.text);

    // Build document object with properties and vectors
    docsToInsert.push({
      properties: {
        text: item.text,
        chunkIndex: item.chunkIndex,
        totalChunks: item.totalChunks,
        prevChunkIndex: item.prevChunkIndex,
        nextChunkIndex: item.nextChunkIndex,
        sourceName: item.sourceName,
        sourceType: item.sourceType,
        sourceSize: item.sourceSize,
        uploadDate: item.uploadDate,
        sourceNamespace: item.sourceNamespace,
        userId: item.userId,
      },
      vectors: embedding,
    });
  }

  console.log(
    "Docs a insertar en Weaviate:",
    JSON.stringify(docsToInsert, null, 2)
  );

  await fileColection.updateOne({ _id: idUploadFile }, { $set: { status: 2 } });

  try {
    const weaviateClient = await getWeaviateClient();
    const resultsss = await weaviateClient.collections
      .get("DocumentChunk")
      .data.insertMany(docsToInsert);
    console.log(
      "Resultado de la inserción en Weaviate:",
      JSON.stringify(resultsss, null, 2)
    );
    console.log("Insert exitoso en Weaviate. Total:", docsToInsert.length);
  } catch (error) {
    console.error("Error al insertar en Weaviate:", error);
    throw error;
  }
}

async function processDocument(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = await extractTextFromFile(buffer.buffer, file);

  // Divide el texto en chunks usando RecursiveCharacterTextSplitter
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const splitTexts = await textSplitter.splitText(text.trim());

  const chunks = splitTexts.map((chunk, index) => ({
    text: chunk,
    id: `${file.name}-chunk-${index + 1}`,
  }));

  console.log(
    `Archivo ${file.name} procesado. Total de chunks: ${chunks.length}`
  );

  return {
    chunks,
    filename: file.name,
  };
}

async function fileRetrieval(
  files: File[],
  testMode: boolean,
  formNamespace: string,
  userId: string
): Promise<Array<Record<string, unknown>>> {
  const { db } = await connectToDatabase();
  const fileColection = db.collection("file");

  const processedFiles = [];

  for (const file of files) {
    // Aquí se guarda el archivo en MongoDB
    const idUploadFile = await fileColection.insertOne({
      filename: file.name,
      size: file.size,
      type: file.type,
      chunks: null,
      vectorsUploaded: null,
      namespace: formNamespace,
      uploadDate: new Date(),
      status: 1,
      userId: userId,
    });
    try {
      const { chunks: rawChunks, filename } = await processDocument(file);
      const chunks = await rawChunks.filter(
        (chunk): chunk is Chunk => chunk !== null
      );
      console.log("chunks", chunks.length);

      if (testMode) {
        processedFiles.push({
          filename,
          size: file.size,
          type: file.type,
          chunks: chunks.length,
        });
        continue;
      }

      // Aquí se actualizan los chunks el archivo en MongoDB
      await fileColection.updateOne(
        { _id: idUploadFile.insertedId },
        { $set: { chunks: chunks.length, vectorsUploaded: chunks.length } }
      );

      // Aquí se suben los datos a Weaviate
      await insertDataToWeaviate(
        chunks,
        filename,
        file,
        formNamespace,
        idUploadFile.insertedId,
        userId
      );

      processedFiles.push({
        filename,
        size: file.size,
        type: file.type,
        chunks: chunks.length,
        vectorsUploaded: chunks.length,
        namespace: formNamespace,
      });
    } catch (error) {
      console.error(`Error procesando ${file.name}:`, error);
      processedFiles.push({
        filename: file.name,
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return processedFiles;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const testMode = req.nextUrl.searchParams.get("test") === "true";
    const namespace = req.nextUrl.searchParams.get("namespace") || "default";
    const formData = await req.formData();
    let files = formData.getAll("file") as File[];

    if (!files || files.length === 0) {
      files = formData.getAll("files") as File[];
    }

    const formNamespace = (formData.get("namespace") as string) || namespace;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No se proporcionaron archivos" },
        { status: 400 }
      );
    }

    const className = "DocumentChunk";
    await ensureWeaviateClassExists(className);
    console.log(`Clase ${className} asegurada en Weaviate.`);

    const processedFiles = await fileRetrieval(files, testMode, formNamespace, userId);

    return NextResponse.json({
      success: true,
      message: `${files.length} archivos procesados.`,
      processedFiles,
    });
  } catch (error) {
    console.error("Error general:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error al procesar",
      },
      { status: 500 }
    );
  }
}
