import {NextRequest, NextResponse} from "next/server";
import {OpenAIEmbeddings} from "@langchain/openai";
import {RecursiveCharacterTextSplitter} from "@langchain/textsplitters";
import mammoth from "mammoth";
import weaviate, {WeaviateClient} from "weaviate-client";

const openaiEmbeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY!,
});

const weaviateApiKey = process.env.WEAVIATE_API_KEY!;

const client: WeaviateClient = await weaviate.connectToWeaviateCloud(
  process.env.WEAVIATE_HOST!,
  {
    authCredentials: new weaviate.ApiKey(weaviateApiKey),
  },
);

// Asegúrate que la clase existe en Weaviate
async function ensureWeaviateClassExists(className: string) {
  const myCollection = client.collections.get(className);
  if (!myCollection) {
    console.log(`La colección ${className} no existe.`);
    client.collections.create({
      name: className,
      vectorizers: undefined,
      properties: [
        {name: "text", dataType: "text"},
        {name: "sourceName", dataType: "text"},
        {name: "sourceType", dataType: "text"},
        {name: "sourceSize", dataType: "text"},
        {name: "uploadDate", dataType: "text"},
        {name: "chunkIndex", dataType: "int"},
        {name: "totalChunks", dataType: "int"},
        {name: "sourceNamespace", dataType: "text"},
      ],
    });
  }
}

async function extractTextFromFile(
  buffer: ArrayBuffer,
  file: File,
): Promise<string> {
  const mime = file.type;

  if (mime === "application/pdf") {
    return ""; // Integrar con pdfParse o PyMuPDF si quieres
  }

  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({buffer: Buffer.from(buffer)});
    return result.value || "";
  }

  if (mime === "text/plain") {
    return new TextDecoder("utf-8").decode(buffer);
  }

  throw new Error(`Tipo de archivo no soportado: ${mime}`);
}

async function processDocument(file: File, embeddings: OpenAIEmbeddings) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = await extractTextFromFile(buffer.buffer, file);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const chunks = await splitter.splitText(text);
  const vectors = await embeddings.embedDocuments(chunks);

  return {
    chunks,
    embeddings: vectors,
    filename: file.name,
  };
}

export async function POST(req: NextRequest) {
  try {
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
        {error: "No se proporcionaron archivos"},
        {status: 400},
      );
    }

    const className = "DocumentChunk";
    await ensureWeaviateClassExists(className);
    console.log(`Clase ${className} asegurada en Weaviate.`);

    const processedFiles = [];
    let totalChunks = 0;

    for (const file of files) {
      try {
        const {chunks, filename} = await processDocument(
          file,
          openaiEmbeddings,
        );
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

        const questions = client.collections.get(className);
        const batchSize = 1000;

        for (let i = 0; i < chunks.length; i++) {
          const batch = chunks.slice(i, i + batchSize);
          const test = await questions.data.insertMany(
            batch.map((chunk, index) => ({
              text: chunk,
              chunkIndex: i + index + 1,
              totalChunks: chunks.length,
              sourceName: filename,
              sourceType: file.type,
              sourceSize: file.size.toString(),
              uploadDate: new Date().toISOString(),
              sourceNamespace: formNamespace,
            })),
          );
          console.log(`Chunk ${i + 1} de ${chunks.length} subido:`, test);
        }

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
      {status: 500},
    );
  }
}
