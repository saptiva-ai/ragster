import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import weaviate, {WeaviateClient} from "weaviate-client";
import { connectToDatabase } from "@/lib/mongodb/client";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import axios from "axios";
import { MODEL_NAMES } from "@/config/models";

interface Chunk {
  text: string;
  id: string;
}

const weaviateApiKey = process.env.WEAVIATE_API_KEY!;

const client: WeaviateClient = await weaviate.connectToWeaviateCloud(
  process.env.WEAVIATE_HOST!,
  {
    authCredentials: new weaviate.ApiKey(weaviateApiKey),
  }
);

// Asegúrate que la clase existe en Weaviate
async function ensureWeaviateClassExists(className: string) {
  // 1. Listar todas las colecciones/clases
  const collections = await client.collections.listAll();
  const exists = collections.some(
    (col: { name: string }) => col.name === className
  );

  if (!exists) {
    console.log(`La colección ${className} no existe. Creando...`);
    await client.collections.create({
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
      ],
    });
    // Esperar a que la colección esté disponible (opcional: reintentos)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log(`Colección ${className} creada.`);
  } else {
    console.log(`La colección ${className} ya existe.`);
  }
}

async function extractTextFromFile(
  buffer: ArrayBuffer,
  file: File
): Promise<string> {
  const mime = file.type;

  if (mime === "application/pdf") {
    // Convertir ArrayBuffer a Blob antes de pasar a PDFLoader
    const pdfBlob = new Blob([buffer], { type: mime });
    const loader = new PDFLoader(pdfBlob, {
      splitPages: true, // Opcional, si quieres dividir por página
    });
    // Extraer texto del PDF
    const docs = await loader.load();
    return docs.map((doc) => doc.pageContent).join("\n");
  }

  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(buffer),
    });
    return result.value || "";
  }

  if (mime === "text/plain") {
    return new TextDecoder("utf-8").decode(buffer);
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
  idUploadFile: import("mongodb").ObjectId
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
      await new Promise(resolve => setTimeout(resolve, 500));
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
      },
      vectors: embedding,
    });
  }

  console.log(
    "Docs a insertar en Weaviate:",
    JSON.stringify(docsToInsert, null, 2)
  );

  try {
    const resultsss = await client.collections
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

  await fileColection.updateOne({ _id: idUploadFile }, { $set: { status: 2 } });
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

export async function POST(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const fileColection = db.collection("file");

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

    const processedFiles = [];
    let totalChunks = 0;

    for (const file of files) {
      try {
        const { chunks: rawChunks, filename } = await processDocument(file);
        const chunks = await rawChunks.filter(
          (chunk): chunk is Chunk => chunk !== null
        );
        console.log("chunks", chunks.length);
        totalChunks += chunks.length;

        if (testMode) {
          processedFiles.push({
            filename,
            size: file.size,
            type: file.type,
            chunks: chunks.length,
          });
          continue;
        }

        // Aquí se guarda el archivo en MongoDB
        const idUploadFile = await fileColection.insertOne({
          filename,
          size: file.size,
          type: file.type,
          chunks: chunks.length,
          vectorsUploaded: chunks.length,
          namespace: formNamespace,
          uploadDate: new Date(),
          status: 1,
        });

        // Aquí se suben los datos a Weaviate
        await insertDataToWeaviate(
          chunks,
          filename,
          file,
          formNamespace,
          idUploadFile.insertedId
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

    return NextResponse.json({
      success: true,
      message: `${files.length} archivos procesados. Total de chunks: ${totalChunks}.`,
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