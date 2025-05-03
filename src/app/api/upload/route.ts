import {NextRequest, NextResponse} from "next/server";
import {Pinecone} from "@pinecone-database/pinecone";
import {processDocument} from "@/lib/document-processing/processor";

// Función para inicializar y obtener un índice de Pinecone
async function getPineconeIndex() {
  const pineconeApiKey = process.env.PINECONE_API_KEY;
  const pineconeIndex = process.env.PINECONE_INDEX || "ragster";
  const pineconeHost = process.env.PINECONE_HOST;

  if (!pineconeApiKey) {
    throw new Error("API Key de Pinecone no configurada");
  }

  if (!pineconeHost) {
    throw new Error("Host de Pinecone no configurado");
  }

  console.log(
    `Inicializando Pinecone con índice: ${pineconeIndex} y host: ${pineconeHost}`,
  );

  try {
    // Crear el cliente de Pinecone y conectarse directamente al índice
    const pinecone = new Pinecone({
      apiKey: pineconeApiKey,
    });

    // Obtener el índice directamente sin verificación previa
    return pinecone.index(pineconeIndex);
  } catch (error) {
    console.error("Error al obtener índice Pinecone:", error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verificar si estamos en modo de prueba
    const testMode = req.nextUrl.searchParams.get("test") === "true";

    // Get namespace from query parameters if provided
    const namespace = req.nextUrl.searchParams.get("namespace") || undefined;

    // Procesar la solicitud de carga de archivos
    const formData = await req.formData();

    // Intentar obtener archivos de ambos campos posibles: 'file' y 'files'
    let files = formData.getAll("file") as File[];

    // Si no hay archivos en 'file', probar con 'files'
    if (!files || files.length === 0) {
      files = formData.getAll("files") as File[];
    }

    // Check if namespace is provided in formData (higher priority)
    const formNamespace = (formData.get("namespace") as string) || namespace;

    if (!files || files.length === 0) {
      return NextResponse.json(
        {error: "No se proporcionaron archivos"},
        {status: 400},
      );
    }

    // Información de archivos procesados
    const processedFiles = [];
    let totalChunks = 0;

    // Procesar cada archivo
    for (const file of files) {
      console.log(`Procesando archivo: ${file.name} (${file.type})`);

      try {
        // Procesar el documento (extraer texto, dividir en chunks y generar embeddings)
        const {chunks, embeddings, filename} = await processDocument(file);
        totalChunks += chunks.length;

        if (testMode) {
          // En modo de prueba, sólo devolvemos la info sin procesar realmente
          processedFiles.push({
            filename,
            size: file.size,
            type: file.type,
            chunks: chunks.length,
          });
          continue;
        }

        // Guardar los chunks en Pinecone
        const pineconeIndex = await getPineconeIndex();

        // Transformar los chunks a vectores para Pinecone con ID, embedding y metadata
        const vectors = chunks.map((chunk, i) => {
          // Crear un ID único para cada vector
          const id = `${filename.replace(/\s+/g, "_")}_${Date.now()}_${i}`;

          // Mejorar metadata para búsqueda - asegurar que solo tenga tipos válidos para Pinecone
          const enhancedMetadata: Record<
            string,
            string | number | boolean | string[]
          > = {
            sourceId: id.split("_").slice(0, -1).join("_"),
            sourceName: filename,
            sourceType: file.type || "unknown",
            sourceSize: `${Math.round(file.size / 1024)} KB`,
            uploadDate: new Date().toISOString(),
            chunkIndex: i,
            totalChunks: chunks.length,
            // Store namespace in metadata for filtering
            sourceNamespace: formNamespace || "default",
            // Limitamos text a 1000 caracteres para metadata
            text: chunk.substring(0, 1000),
          };

          return {
            id,
            values: embeddings[i],
            metadata: enhancedMetadata,
          };
        });

        // Upsert de los vectores a Pinecone
        console.log(
          `Upserting ${vectors.length} vectores a Pinecone para ${filename}${
            formNamespace ? ` en namespace: ${formNamespace}` : ""
          }`,
        );

        // Hacemos el upsert en lotes para evitar errores de tamaño
        const batchSize = 50;

        for (let i = 0; i < vectors.length; i += batchSize) {
          const batch = vectors.slice(i, i + batchSize);

          try {
            // Use direct approach: create index namespace and upsert there
            const indexNamespace = formNamespace
              ? pineconeIndex.namespace(formNamespace)
              : pineconeIndex;

            await indexNamespace.upsert(batch);

            console.log(
              `Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
                vectors.length / batchSize,
              )} completado`,
            );
          } catch (error) {
            console.error("Error upserting vectors to Pinecone:", error);
            throw error;
          }
        }

        // Añadir información del archivo procesado
        processedFiles.push({
          filename,
          size: file.size,
          type: file.type,
          chunks: chunks.length,
          vectorsUploaded: vectors.length,
          namespace: formNamespace || "default",
        });
      } catch (fileError) {
        console.error(`Error procesando el archivo ${file.name}:`, fileError);

        // Añadir información del error
        processedFiles.push({
          filename: file.name,
          size: file.size,
          type: file.type,
          error:
            fileError instanceof Error
              ? fileError.message
              : "Error desconocido",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `${files.length} archivos procesados con éxito. Se generaron ${totalChunks} chunks en total.`,
      namespace: formNamespace || "default",
      processedFiles,
    });
  } catch (error) {
    console.error("Error procesando archivos:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al procesar la solicitud",
        details: error instanceof Error ? error.stack : undefined,
      },
      {status: 500},
    );
  }
}

// Endpoint para obtener información sobre Pinecone
export async function GET() {
  try {
    // Verificar si existen las credenciales de Pinecone
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeIndex = process.env.PINECONE_INDEX;

    if (!pineconeApiKey || !pineconeIndex) {
      return NextResponse.json({
        success: false,
        error: "No hay credenciales configuradas para Pinecone",
      });
    }

    // Inicializar cliente de Pinecone
    const pinecone = new Pinecone({
      apiKey: pineconeApiKey,
    });

    try {
      // Listar índices disponibles
      const indexes = await pinecone.listIndexes();

      // Verificar si el índice existe
      const index = pinecone.index(pineconeIndex);
      const stats = await index.describeIndexStats();

      return NextResponse.json({
        success: true,
        indexes: indexes.indexes?.map((idx) => idx.name) || [],
        currentIndex: pineconeIndex,
        stats: {
          dimension: stats.dimension,
          namespaces: stats.namespaces,
          vectorCount: stats.totalRecordCount,
        },
      });
    } catch (error) {
      console.error("Error al consultar Pinecone:", error);
      return NextResponse.json({
        success: false,
        error: "Error al consultar Pinecone",
        details: error instanceof Error ? error.message : undefined,
      });
    }
  } catch (error) {
    console.error("Error al procesar la solicitud:", error);
    return NextResponse.json({
      success: false,
      error: "Error al procesar la solicitud",
      details: error instanceof Error ? error.message : undefined,
    });
  }
}
