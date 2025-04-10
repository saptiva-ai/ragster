import {NextRequest, NextResponse} from "next/server";
import {v4 as uuidv4} from "uuid";
import {Pinecone} from "@pinecone-database/pinecone";
import {Document} from "@langchain/core/documents";
import {RecursiveCharacterTextSplitter} from "langchain/text_splitter";

// Función para inicializar y obtener un índice de Pinecone
async function getPineconeIndex() {
  const pineconeApiKey = process.env.PINECONE_API_KEY;
  const pineconeIndex = process.env.PINECONE_INDEX || "documents";

  if (!pineconeApiKey) {
    throw new Error("API Key de Pinecone no configurada");
  }

  const pinecone = new Pinecone({
    apiKey: pineconeApiKey,
  });

  // Verificar si el índice existe
  try {
    const indexList = await pinecone.listIndexes();
    if (!indexList.indexes?.find((idx) => idx.name === pineconeIndex)) {
      throw new Error(`El índice ${pineconeIndex} no existe en Pinecone`);
    }

    return pinecone.index(pineconeIndex);
  } catch (error) {
    console.error("Error al obtener índice Pinecone:", error);
    throw error;
  }
}

/**
 * Generate embeddings using the embedding service
 */
async function generateEmbeddings(documents: Document[]): Promise<number[][]> {
  try {
    // Import the embedding service
    const {EmbeddingService} = await import("@/lib/services/embeddingService");
    const embeddingService = EmbeddingService.getInstance();

    console.log(`Generando embeddings para ${documents.length} documentos...`);

    // Generate embeddings for each document
    const embeddings: number[][] = [];

    // Process in batches to avoid memory issues
    const batchSize = 10;
    for (let i = 0; i < documents.length; i += batchSize) {
      console.log(
        `Procesando lote de embeddings ${i + 1} a ${Math.min(
          i + batchSize,
          documents.length,
        )} de ${documents.length}`,
      );
      const batch = documents.slice(i, i + batchSize);

      // Process documents in parallel within a batch
      const batchEmbeddings = await Promise.all(
        batch.map(async (doc) => {
          try {
            return await embeddingService.generateEmbedding(doc.pageContent);
          } catch (error) {
            console.error(`Error generando embedding para documento: ${error}`);
            throw error; // Re-throw to be caught by outer try/catch
          }
        }),
      );

      embeddings.push(...batchEmbeddings);
    }

    console.log(`Generados ${embeddings.length} embeddings exitosamente`);
    return embeddings;
  } catch (error) {
    console.error("Error generando embeddings:", error);
    throw new Error(
      `Failed to generate embeddings: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// Función para dividir texto en chunks
/* eslint-disable */
async function splitTextIntoDocuments(
  text: string,
  metadata: any,
): Promise<Document[]> {
  // Crear documento inicial
  const initialDoc = new Document({
    pageContent: text,
    metadata,
  });

  // Dividir documento en chunks más pequeños
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  return await splitter.splitDocuments([initialDoc]);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let parsedBody;

    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = body; // Si ya es un objeto no necesita parsearse
    }

    const {text, name} = parsedBody;

    if (!text || !name) {
      return NextResponse.json(
        {error: "Se requiere texto y nombre para procesar"},
        {status: 400},
      );
    }

    // Generar un ID único para este documento
    const sourceId = uuidv4();
    const timestamp = new Date().toISOString();

    // Obtener el índice de Pinecone
    const pineconeIndex = await getPineconeIndex();

    // Dividir texto en chunks y crear documentos con metadata
    const baseMetadata = {
      sourceId,
      sourceName: name,
      sourceType: "text",
      sourceSize: `${Math.round(text.length / 1024)} KB`,
      uploadDate: timestamp,
    };

    const documents = await splitTextIntoDocuments(text, baseMetadata);

    // Añadir ID único para cada chunk
    documents.forEach((doc) => {
      doc.metadata.chunkId = `${sourceId}-${Math.random()
        .toString(36)
        .substring(2, 9)}`;
    });

    console.log(`Texto procesado: ${documents.length} chunks generados`);

    // Generar embeddings
    const embeddingVectors = await generateEmbeddings(documents);

    // Crear vectores para Pinecone
    const vectors = documents.map((doc, i) => ({
      id: doc.metadata.chunkId,
      values: embeddingVectors[i],
      metadata: {
        text: doc.pageContent,
        ...doc.metadata,
      },
    }));

    // Subir vectores a Pinecone en lotes
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await pineconeIndex.upsert(batch);
    }

    // Crear el objeto fuente para la respuesta
    const newSource = {
      id: sourceId,
      name,
      type: "text",
      size: `${Math.round(text.length / 1024)} KB`,
      uploadDate: timestamp,
      chunkCount: documents.length,
    };

    return NextResponse.json({
      success: true,
      sourceId,
      chunksProcessed: documents.length,
      source: newSource,
    });
  } catch (error) {
    console.error("Error en la solicitud:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al procesar la solicitud",
      },
      {status: 500},
    );
  }
}

// Endpoint GET para recuperar fuentes procesadas desde Pinecone
export async function GET() {
  try {
    // Obtener el índice de Pinecone
    const pineconeIndex = await getPineconeIndex();

    // Importar el servicio de embeddings
    const {EmbeddingService} = await import("@/lib/services/embeddingService");
    const embeddingService = EmbeddingService.getInstance();

    // Generar un embedding real para la consulta
    const queryText = "Listar fuentes de texto";
    const queryEmbedding = await embeddingService.generateEmbedding(queryText);

    // Consulta para obtener vectores
    const queryResponse = await pineconeIndex.query({
      vector: queryEmbedding,
      topK: 1000,
      includeMetadata: true,
      filter: {sourceType: {$eq: "text"}},
    });

    // Extraer fuentes únicas
    const sourceMap = new Map();
    queryResponse.matches?.forEach((match) => {
      const metadata = match.metadata;
      if (metadata && metadata.sourceId) {
        if (!sourceMap.has(metadata.sourceId)) {
          sourceMap.set(metadata.sourceId, {
            id: metadata.sourceId,
            name: metadata.sourceName || "Texto sin nombre",
            type: "text",
            size: metadata.sourceSize || "Desconocido",
            uploadDate: metadata.uploadDate || new Date().toISOString(),
            chunkCount: 1,
          });
        } else {
          // Incrementar contador de chunks
          const source = sourceMap.get(metadata.sourceId);
          source.chunkCount += 1;
          sourceMap.set(metadata.sourceId, source);
        }
      }
    });

    return NextResponse.json({
      sources: Array.from(sourceMap.values()),
    });
  } catch (error) {
    console.error("Error al obtener fuentes de texto de Pinecone:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al obtener fuentes de Pinecone",
        sources: [],
      },
      {status: 500},
    );
  }
}
