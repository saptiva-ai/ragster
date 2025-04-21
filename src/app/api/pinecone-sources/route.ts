import {NextResponse} from "next/server";
import {Pinecone} from "@pinecone-database/pinecone";

// Función auxiliar para obtener metadata única de vectores
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractUniqueSourcesFromPinecone(vectors: any[]) {
  const sourceMap = new Map();

  vectors.forEach((vector) => {
    const metadata = vector.metadata;
    if (metadata && metadata.sourceId) {
      if (!sourceMap.has(metadata.sourceId)) {
        sourceMap.set(metadata.sourceId, {
          id: metadata.sourceId,
          name: metadata.sourceName || "Documento sin nombre",
          type: metadata.sourceType || "documento",
          size: metadata.sourceSize || "Desconocido",
          uploadDate: metadata.uploadDate || new Date().toISOString(),
          chunkCount: 1,
          fromPinecone: true,
          sourceNamespace: metadata.namespace || "",
        });
      } else {
        // Incrementar contador de chunks
        const source = sourceMap.get(metadata.sourceId);
        source.chunkCount += 1;
        sourceMap.set(metadata.sourceId, source);
      }
    }
  });

  return Array.from(sourceMap.values());
}

export async function GET() {
  try {
    // Verificar si existen las credenciales de Pinecone
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeIndex = process.env.PINECONE_INDEX || "documents";

    if (!pineconeApiKey) {
      return NextResponse.json({
        success: false,
        error: "No hay credenciales configuradas para Pinecone",
        sources: [],
      });
    }

    // Inicializar cliente de Pinecone
    const pinecone = new Pinecone({
      apiKey: pineconeApiKey,
    });

    // Obtener el índice
    try {
      const index = pinecone.index(pineconeIndex).namespace("default");

      // Importar el servicio de embeddings
      const {EmbeddingService} = await import(
        "@/lib/services/embeddingService"
      );
      const embeddingService = EmbeddingService.getInstance();

      // Obtener la dimensión correcta del modelo configurado
      const dimensions = parseInt(process.env.PINECONE_DIMENSIONS || "1024");
      console.log(
        `Usando dimensión ${dimensions} para consulta de fuentes en Pinecone`,
      );

      // Generar un embedding real para la consulta
      const queryText = "Lista de todas las fuentes disponibles";
      const queryEmbedding = await embeddingService.generateEmbedding(
        queryText,
      );

      console.log(
        `Generando embedding para la consulta "${queryText}" con ${dimensions} dimensiones`,
      );
      console.log("Embedding generado:", queryEmbedding);

      // Hacer una consulta para obtener vectores con sus metadatos

      const queryResponse = await index.query({
        vector: queryEmbedding,
        topK: 500, // Usar 500 para obtener más vectores
        includeMetadata: true,
        includeValues: false,
      });
      console.log(
        `Consulta a Pinecone realizada con éxito. Recuperados ${queryResponse.matches?.length} vectores.`,
      );
      console.log("Respuesta de Pinecone:", queryResponse);

      // Extraer fuentes únicas de los resultados
      const sources = extractUniqueSourcesFromPinecone(
        queryResponse.matches || [],
      );

      console.log(
        `Recuperadas ${sources.length} fuentes únicas de Pinecone de ${
          queryResponse.matches?.length || 0
        } vectores`,
      );

      return NextResponse.json({
        success: true,
        sources,
      });
    } catch (error) {
      console.error("Error al consultar Pinecone:", error);
      return NextResponse.json({
        success: false,
        error: "Error al consultar Pinecone",
        sources: [],
      });
    }
  } catch (error) {
    console.error("Error al procesar la solicitud:", error);
    return NextResponse.json({
      success: false,
      error: "Error al procesar la solicitud",
      sources: [],
    });
  }
}
