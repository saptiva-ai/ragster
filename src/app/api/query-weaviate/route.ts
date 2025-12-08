import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb/client";
import { weaviateClient } from "@/lib/services/weaviate-client";
import { getSaptivaEmbedder } from "@/lib/services/embedders/saptiva-embedder";
import { ModelFactory } from "@/lib/services/modelFactory";

/**
 * Extract question from text (Spanish format)
 */
function extractQuestion(text: string): string | null {
  const regex = /¿(.*?)\?/;
  const match = text.match(regex);
  return match && match[1] ? `¿${match[1]}?` : null;
}

/**
 * Ambiguous words that indicate continuation of previous topic
 */
const AMBIGUOUS_WORDS = [
  "si", "sí", "ok", "cuéntame más", "claro", "entendido",
  "perfecto", "de acuerdo", "vale", "genial", "bueno",
  "está bien", "sí, claro", "sí, por supuesto",
  "si, claro", "si, por supuesto",
];

/**
 * Search in Weaviate using vector similarity
 */
async function searchInWeaviate(queryText: string) {
  const embedder = getSaptivaEmbedder();
  const embeddingResult = await embedder.embed(queryText);

  // Use v2 API via weaviateClient (shared collection)
  const results = await weaviateClient.searchByVector(
    embeddingResult.embedding,
    10,
    'text sourceName chunkIndex totalChunks'
  );

  console.log(`[Query] Found ${results.length} results`);
  return results;
}

/**
 * Build context from search results
 */
function buildContext(results: Array<{ properties: Record<string, unknown> }>): string {
  if (results.length === 0) return "";

  return results
    .map((chunk, index) => {
      const text = typeof chunk.properties.text === "string" ? chunk.properties.text : "";
      return `[Sección ${index + 1}]:\n${text}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Build prompt for LLM
 */
function buildPrompt(
  systemPrompt: string,
  context: string,
  history: string,
  previousQuestion: string,
  query: string,
  contactName?: string
): string {
  return `
Contexto General:
${systemPrompt}

=== INFORMACIÓN RELEVANTE DE LOS DOCUMENTOS ===
${context}

=== INSTRUCCIONES CRÍTICAS ===

1. PRIORIDAD ABSOLUTA: Si la pregunta busca NÚMEROS, FECHAS, PORCENTAJES o ESTADÍSTICAS, búscalos en TODA la información anterior.
2. RESPALDO: Cuando uses datos específicos, basa tu respuesta en los documentos.
3. USA TODA la información: No te limites a la primera parte. Combina información de múltiples secciones si es necesario.
4. NO digas "no hay información" o "no se puede determinar" sin haber revisado TODO el contenido primero.
5. Para preguntas de "por qué" o "cómo", sintetiza información de varias partes del documento.
6. Lenguaje claro y profesional.
7. NUNCA inventes datos. Si realmente no está en los documentos, di claramente "no encuentro esa información específica en los documentos".
8. Responde siempre en español.
9. No incluyas etiquetas como <think> o </think>.
10. Si el mensaje es breve ("sí", "ok", "cuéntame más"), asume que responde afirmativamente a la última pregunta.

Historial de conversación: "${history}"
Última pregunta enviada: "${previousQuestion}"
${contactName && contactName !== "Chat Interno" ? `Nombre del contacto: "${contactName}"\n` : ""}
Mensaje actual del usuario: "${query}"`;
}

/**
 * POST /api/query-weaviate
 * Query documents and generate AI response.
 * Note: Auth check removed to allow WhatsApp webhook access.
 * All users share the same document pool.
 */
export async function POST(req: NextRequest) {
  try {
    // Note: Auth not required - WhatsApp webhook needs access
    // All users share the same document pool

    // 2. Parse request
    const body = await req.json();
    const {
      message_id,
      query,
      systemPrompt,
      modelId,
      temperature,
      contacts = [],
    } = body;

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    const contactName = contacts?.[0]?.profile?.name || "Chat Interno";
    console.log(`[Query] Processing: "${query}" from: ${contactName}`);

    // 3. Save user message to MongoDB
    const { db } = await connectToDatabase();
    const messagesCollection = db.collection("messages");

    await messagesCollection.insertOne({
      message_id,
      message_role: "user",
      model: modelId,
      message: query,
      temperature: temperature,
      max_tokens: 1000,
      timestamp: new Date(),
      contact_name: contactName,
    });

    // 4. Get conversation history
    const messages = await messagesCollection
      .find({ message_id })
      .sort({ _id: -1 })
      .limit(5)
      .toArray();

    let previousQuestion = "";
    let history = "";

    if (messages.length > 1) {
      previousQuestion = extractQuestion(messages[1].message) || "";
      messages.reverse();
      history = messages
        .map((m) => `- Role: ${m.message_role}\n  - Mensaje: ${m.message}`)
        .join("\n");
    }

    // 5. Determine search query (handle ambiguous responses)
    const normalizedQuery = query.trim().toLowerCase();
    const isAmbiguous = AMBIGUOUS_WORDS.includes(normalizedQuery);
    const searchQuery = isAmbiguous && previousQuestion ? previousQuestion : query;

    // 6. Search in Weaviate (shared collection)
    const results = isAmbiguous && !previousQuestion
      ? []
      : await searchInWeaviate(searchQuery);

    // 7. Build context and prompt
    const context = buildContext(results);
    const prompt = buildPrompt(
      systemPrompt,
      context,
      history,
      previousQuestion,
      query,
      contactName
    );

    // 8. Generate LLM response
    const modelService = ModelFactory.getModelService();
    const answer = await modelService.generateText(
      message_id,
      prompt,
      query,
      modelId,
      temperature || 0.3
    );

    return NextResponse.json({
      success: true,
      query,
      matches: [],
      answer,
      modelId,
      provider: "saptiva",
    });

  } catch (error) {
    console.error("[Query] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error processing query",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
