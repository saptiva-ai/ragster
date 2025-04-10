import {Pinecone} from "@pinecone-database/pinecone";
import {Document} from "@langchain/core/documents";

// Creamos un singleton para el cliente de Pinecone
let pineconeClient: Pinecone | null = null;

export const initPinecone = async (apiKey: string) => {
  try {
    if (!pineconeClient) {
      pineconeClient = new Pinecone({
        apiKey,
      });
    }
    return pineconeClient;
  } catch (error) {
    console.error("Error inicializando Pinecone:", error);
    throw error;
  }
};

export const getPineconeClient = () => {
  if (!pineconeClient) {
    throw new Error(
      "Pinecone client no inicializado. Llama a initPinecone primero.",
    );
  }
  return pineconeClient;
};

export const createPineconeIndex = async (
  client: Pinecone,
  indexName: string,
) => {
  try {
    // Verificar si el índice ya existe
    const indexes = await client.listIndexes();

    if (!indexes.indexes?.find((idx) => idx.name === indexName)) {
      // Obtener configuración desde variables de entorno
      const dimensions = parseInt(process.env.PINECONE_DIMENSIONS || "1536");
      console.log(`Creando índice: ${indexName} con ${dimensions} dimensiones`);

      // Crear índice directamente con serverless AWS
      await client.createIndex({
        name: indexName,
        dimension: dimensions,
        metric: "cosine",
        spec: {
          serverless: {
            cloud: "aws",
            region: "us-west-2",
          },
        },
      });

      // Esperar a que el índice esté listo
      console.log("Esperando a que el índice esté listo...");
      await new Promise((resolve) => setTimeout(resolve, 10000));
    } else {
      console.log(`Índice ${indexName} ya existe.`);
    }

    // Obtener el índice
    return client.index(indexName);
  } catch (error) {
    console.error("Error creando o conectando a índice Pinecone:", error);
    throw error;
  }
};

export const uploadDocumentsToPinecone = async (
  documents: Document[],
  embeddings: number[][],
  indexName: string,
) => {
  try {
    const client = getPineconeClient();
    const index = client.index(indexName);

    console.log(`Subiendo ${documents.length} documentos a Pinecone...`);

    // Crear vectores para Pinecone
    const vectors = documents.map((doc, i) => ({
      id: (doc.metadata.chunkId as string) || `doc-${i}`,
      values: embeddings[i],
      metadata: {
        text: doc.pageContent,
        ...doc.metadata,
      },
    }));

    // Upsert por lotes (máximo 100 por lote)
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await index.upsert(batch);
    }

    console.log("Documentos subidos exitosamente a Pinecone");
    return {success: true, count: documents.length};
  } catch (error) {
    console.error("Error al subir documentos a Pinecone:", error);
    throw error;
  }
};
