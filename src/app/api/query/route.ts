import {NextRequest, NextResponse} from "next/server";
import {Pinecone} from "@pinecone-database/pinecone";
import {EmbeddingService} from "@/lib/services/embeddingService";
import {ModelFactory} from "@/lib/services/modelFactory";

// Función para inicializar y obtener un índice de Pinecone
async function getPineconeIndex() {
  const pineconeApiKey = process.env.PINECONE_API_KEY;
  const pineconeIndex = process.env.PINECONE_INDEX || "ragster";

  if (!pineconeApiKey) {
    throw new Error("API Key de Pinecone no configurada");
  }

  try {
    // Crear el cliente de Pinecone y conectarse al índice
    const pinecone = new Pinecone({
      apiKey: pineconeApiKey,
    });

    // Obtener el índice
    return pinecone.index(pineconeIndex);
  } catch (error) {
    console.error("Error al obtener índice Pinecone:", error);
    throw error;
  }
}

// Función para obtener los namespaces disponibles en el índice
async function getAvailableNamespaces() {
  try {
    const pineconeIndex = await getPineconeIndex();

    // Intentamos obtener la lista de namespaces
    const stats = await pineconeIndex.describeIndexStats();

    // La respuesta en namespaces contiene un objeto con las claves siendo los nombres de namespaces
    const namespaces = stats?.namespaces ? Object.keys(stats.namespaces) : [];

    // Si no hay namespaces, devolver al menos 'default'
    if (namespaces.length === 0) {
      return ["default", "test_docs"]; // Incluimos algunos por defecto
    }

    return namespaces;
  } catch (error) {
    console.error("Error al obtener namespaces:", error);
    // Devolver namespaces por defecto en caso de error
    return ["default", "test_docs"];
  }
}

// Función para limpiar texto de marcado XML y otros formatos no deseados
function cleanSourceText(text: string): string {
  if (!text) return "";

  // Primera pasada: eliminar etiquetas y códigos XML completos
  let cleaned = text
    // Eliminar cualquier etiqueta XML/HTML
    .replace(/<[^>]*>/g, "")
    // Eliminar atributos específicos de Word
    .replace(/w:[a-z]+="[^"]*"/g, "")
    .replace(/xml:space="[^"]*"/g, "")
    // Eliminar palabras clave y estructuras específicas de Word
    .replace(/\b(w|xml):[a-z]+\b/g, "")
    .replace(
      /tcPr|tcBorders|w:val|dxa|rsidR|rsidDel|rsidP|rsidRDefault|rsidRPr|w14:paraId/g,
      "",
    )
    .replace(
      /paraId|space|sz|single|top|left|bottom|right|jc|rPr|pPr|color|val/g,
      "",
    )
    // Eliminar secuencias que parecen valores numéricos solos
    .replace(/\b\d+\.\d+\b(?!\s*[a-zA-Z])/g, "")
    // Eliminar caracteres de control y no imprimibles
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    // Eliminar referencias a "Del" y "R" que podrían ser residuos XML
    .replace(/\s*Del="[^"]*"\s*/g, " ")
    .replace(/\s*R="[^"]*"\s*/g, " ");

  // Segunda pasada: eliminar números y códigos dispersos
  cleaned = cleaned
    // Eliminar caracteres sueltos como <, >, / que suelen quedar después de limpiar XML
    .replace(/[<>\/]{1,2}(?!\w)/g, "")
    // Eliminar números hexadecimales
    .replace(/\b[0-9A-F]{6,}\b/g, "")
    // Normalizar espacios
    .replace(/\s+/g, " ")
    // Eliminar texto como "Align" que suele ser parte de atributos
    .replace(/\bAlign\b/g, "")
    // Eliminar palabras que están cortadas o fragmentadas
    .replace(/\b\w{1,2}\b(?!\s*\w{1,2}\b)/g, "")
    .trim();

  // Si después de limpiar queda muy poco texto o solo hay números/símbolos, intentar recuperar algo útil
  if (cleaned.length < 10 || !/[a-zA-Z]{3,}/.test(cleaned)) {
    // Extraer cualquier frase que parezca útil
    const usefulPhrases = text.match(/[A-Z][a-zA-Z\s,]{5,}[.?!]/g);
    if (usefulPhrases && usefulPhrases.length > 0) {
      return usefulPhrases.join(" ");
    }

    // Si el texto limpio es demasiado corto o solo contiene símbolos/números
    if (cleaned.length < 5 || !/[a-zA-Z]/.test(cleaned)) {
      return "Contenido no disponible en formato legible";
    }
  }

  return cleaned;
}

async function generateQueryEmbedding(query: string): Promise<number[]> {
  try {
    // Import the embedding service
    const {EmbeddingService} = await import("@/lib/services/embeddingService");
    const embeddingService = EmbeddingService.getInstance();

    console.log("Generating embedding for query...");
    return await embeddingService.generateEmbedding(query);
  } catch (error) {
    console.error("Error generating query embedding:", error);
    throw new Error(
      `Failed to generate query embedding: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      query,
      namespace,
      topK = 5,
      filter,
      systemPrompt,
      modelId,
      temperature,
    } = await req.json();

    if (!query) {
      return NextResponse.json(
        {error: "Se requiere una consulta"},
        {status: 400},
      );
    }

    console.log(`Processing query: "${query}"`);

    // Obtener el índice de Pinecone
    const pineconeIndex = await getPineconeIndex();

    // Generar embedding para la consulta
    console.log("Generating embedding for query...");
    const queryEmbedding = await generateQueryEmbedding(query);

    // Configurar parámetros para la consulta a Pinecone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryParams: any = {
      vector: queryEmbedding,
      topK: topK,
      includeMetadata: true,
    };

    // Añadir namespace si se proporciona
    if (namespace && namespace !== "default") {
      console.log(`Querying namespace: ${namespace}`);
      queryParams.namespace = namespace;
    } else {
      console.log(`Querying default namespace`);
    }

    // Añadir filtro si se proporciona
    if (filter) {
      queryParams.filter = filter;
    }

    // Realizar la consulta a Pinecone
    const queryResponse = await pineconeIndex.query(queryParams);

    // Verificar si hay resultados
    if (!queryResponse.matches || queryResponse.matches.length === 0) {
      return NextResponse.json({message: "No se encontraron resultados"});
    }

    console.log(`Found ${queryResponse.matches.length} matches`);

    // Preparar resultados para la respuesta
    const matches = queryResponse.matches.map((match) => {
      // Limpiar el texto del resultado
      const text =
        typeof match.metadata?.text === "string"
          ? cleanSourceText(match.metadata.text)
          : "No text available";

      return {
        id: match.id,
        score: match.score,
        text,
        metadata: match.metadata,
      };
    });

    // Preparar el prompt para el modelo
    let enhancedPrompt = query;

    // Si hay coincidencias, incluirlas como contexto
    if (matches.length > 0) {
      enhancedPrompt = `Estoy buscando información sobre: ${query}\n\nContexto relevante:\n`;
      matches.forEach((match, index) => {
        enhancedPrompt += `\nFragmento ${index + 1}:\n${match.text}\n`;
      });

      enhancedPrompt +=
        "\n\nBasándote en la información proporcionada, responde a la pregunta: " +
        query;
    }

    // Llamar al modelo para generar una respuesta
    const modelService = ModelFactory.getModelService();
    const answer = await modelService.generateText(
      enhancedPrompt,
      systemPrompt,
      modelId || "Qwen",
      temperature || 0.7,
    );

    return NextResponse.json({
      success: true,
      query: query,
      matches: matches,
      answer: answer,
      model: "Qwen",
      provider: "saptiva",
    });
  } catch (error) {
    console.error("Error processing query:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Error processing query",
        details: error instanceof Error ? error.stack : undefined,
      },
      {status: 500},
    );
  }
}

// For testing with GET requests
export async function GET(req: NextRequest) {
  try {
    // Get query from URL parameters
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("q");
    const listNamespaces = searchParams.get("listNamespaces") === "true";

    // Si se solicita la lista de namespaces, devolver solo eso
    if (listNamespaces) {
      const namespaces = await getAvailableNamespaces();
      return NextResponse.json({success: true, namespaces});
    }

    const namespace = searchParams.get("namespace") || undefined;
    const topK = parseInt(searchParams.get("topK") || "3", 10);
    const modelId = searchParams.get("model") || "Qwen";
    const temperature = parseFloat(searchParams.get("temperature") || "0.7");
    const systemPrompt = searchParams.get("systemPrompt") || "";

    if (!query) {
      return NextResponse.json(
        {error: 'Query parameter "q" is required'},
        {status: 400},
      );
    }

    console.log(`Processing GET query: "${query}"`);

    // Get embedding service
    const embeddingService = EmbeddingService.getInstance();

    // Generate embedding for query
    console.log("Generating embedding for query...");
    const queryEmbedding = await embeddingService.generateEmbedding(query);

    // Get Pinecone index
    const pineconeIndex = await getPineconeIndex();

    // Create query options
    const queryOptions = {
      vector: queryEmbedding,
      topK: topK,
      includeMetadata: true,
    };

    // Use the namespace approach instead of filter
    let results;
    try {
      if (namespace) {
        console.log(`Querying namespace: ${namespace}`);
        const namespaceIndex = pineconeIndex.namespace(namespace);
        results = await namespaceIndex.query(queryOptions);
      } else {
        console.log(`Querying default namespace`);
        results = await pineconeIndex.query(queryOptions);
      }
    } catch (error) {
      console.error("Error al consultar Pinecone:", error);
      results = {matches: []};
    }

    // Extract and format results
    const matches =
      results.matches?.map((match) => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata,
        text: match.metadata?.text || "No text available",
      })) || [];

    console.log(`Found ${matches.length} matches`);

    // Transformar los resultados para incluir coincidencias relevantes y formatear correctamente
    const formattedMatches = matches.map((match) => {
      // Extraer texto limpio del documento
      let text = match.metadata?.text || match.metadata?.pageContent || "";

      // Asegurar que el texto sea string
      text = String(text);

      // Limpiar el texto para eliminar marcado XML
      text = cleanSourceText(text);

      return {
        id: match.id,
        score: match.score,
        text: text,
        metadata: match.metadata,
      };
    });

    // Preparar el prompt para el modelo
    let enhancedPrompt = query;

    // Si hay coincidencias, incluirlas como contexto
    if (formattedMatches.length > 0) {
      enhancedPrompt = `Estoy buscando información sobre: ${query}\n\nContexto relevante:\n`;
      formattedMatches.forEach((match, index) => {
        enhancedPrompt += `\nFragmento ${index + 1}:\n${match.text}\n`;
      });

      enhancedPrompt +=
        "\n\nBasándote en la información proporcionada, responde a la pregunta: " +
        query;
    }

    // Sistema prompt por defecto si no se proporciona
    const defaultSystemPrompt =
      "Eres un asistente AI especializado en responder preguntas basándote en la información proporcionada. Utiliza solo el contexto proporcionado para responder. Si la información no está en el contexto, indícalo claramente.";

    // Llamar al modelo para generar una respuesta
    const modelService = ModelFactory.getModelService();
    const answer = await modelService.generateText(
      enhancedPrompt,
      systemPrompt || defaultSystemPrompt,
      modelId,
      temperature,
    );

    return NextResponse.json({
      success: true,
      query: query,
      matches: formattedMatches,
      answer: answer,
      model: modelId,
      provider: "saptiva",
    });
  } catch (error) {
    console.error("Error processing query:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Error processing query",
        details: error instanceof Error ? error.stack : undefined,
      },
      {status: 500},
    );
  }
}
