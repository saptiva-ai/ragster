import {Document} from "@langchain/core/documents";
import {
  initPinecone,
  createPineconeIndex,
  uploadDocumentsToPinecone,
} from "@/lib/pinecone/client";

// Simular la generación de embeddings
async function generateEmbeddings(documents: Document[]): Promise<number[][]> {
  try {
    // En una implementación real, aquí usaríamos OpenAI para generar embeddings
    // Por ahora, simplemente generamos vectores aleatorios del tamaño esperado (1536)
    console.log(`Generando embeddings para ${documents.length} chunks...`);

    // Simulamos los embeddings para cada documento
    return documents.map(() =>
      Array(1536)
        .fill(0)
        .map(() => Math.random() * 2 - 1),
    );
  } catch (error) {
    console.error("Error generando embeddings:", error);
    throw error;
  }
}

export async function storeChunks(
  chunks: Document[],
  indexName: string = "documents",
): Promise<void> {
  try {
    // Obtener claves de API de las variables de entorno o configuración
    const pineconeApiKey = process.env.PINECONE_API_KEY || "demo-api-key";

    // Inicializar Pinecone
    const pineconeClient = await initPinecone(pineconeApiKey);
    await createPineconeIndex(pineconeClient, indexName);

    // Generar embeddings (simulado)
    const embeddings = await generateEmbeddings(chunks);

    // Subir a Pinecone
    await uploadDocumentsToPinecone(chunks, embeddings, indexName);

    console.log(`${chunks.length} chunks almacenados en Pinecone exitosamente`);
  } catch (error) {
    console.error("Error al almacenar chunks:", error);
    throw error;
  }
}
