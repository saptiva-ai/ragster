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
 * Context Window Management
 *
 * Saptiva API limit: 8192 tokens (server-side enforced)
 * Token estimation: ~1 token per 4 characters (conservative)
 *
 * Budget allocation for 8K limit:
 * - System prompt + instructions: ~1500 tokens
 * - Conversation history: ~500 tokens
 * - User query: ~100 tokens
 * - LLM response: ~1500 tokens
 * - Safety margin: ~600 tokens
 * - Available for context: ~4000 tokens (~16K chars)
 *
 * Being conservative to account for large system prompts
 */
const MAX_CONTEXT_TOKENS = 3000;
const CHARS_PER_TOKEN = 4;
const MAX_CONTEXT_CHARS = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN; // ~12,000 chars

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
 * Build context from search results with DYNAMIC chunk selection.
 * Adds chunks one by one until we hit the context limit.
 * This prevents "context window exceeded" errors while maximizing info.
 *
 * @returns Object with context string and stats about chunks used
 */
function buildContext(results: Array<{ properties: Record<string, unknown> }>): {
  context: string;
  usedChunks: number;
  totalChunks: number;
  totalChars: number;
} {
  if (results.length === 0) {
    return { context: "", usedChunks: 0, totalChunks: 0, totalChars: 0 };
  }

  let contextText = "";
  let currentChars = 0;
  let usedChunks = 0;

  for (let i = 0; i < results.length; i++) {
    const chunk = results[i];
    const text = typeof chunk.properties.text === "string" ? chunk.properties.text : "";
    const sourceName = typeof chunk.properties.sourceName === "string" ? chunk.properties.sourceName : "Documento";

    // Format the section
    const sectionContent = `[Sección ${i + 1}] (${sourceName}):\n${text}`;
    const sectionWithSeparator = sectionContent + "\n\n---\n\n";

    // Check if adding this chunk would overflow our budget
    if (currentChars + sectionWithSeparator.length > MAX_CONTEXT_CHARS) {
      console.log(`[Context] Limit reached at chunk ${i + 1}/${results.length} (${currentChars} chars used, limit: ${MAX_CONTEXT_CHARS})`);
      break;
    }

    // Safe to add this chunk
    contextText += sectionWithSeparator;
    currentChars += sectionWithSeparator.length;
    usedChunks++;
  }

  // Log context usage stats
  const utilizationPercent = Math.round((currentChars / MAX_CONTEXT_CHARS) * 100);
  console.log(`[Context] Using ${usedChunks}/${results.length} chunks (${currentChars} chars, ${utilizationPercent}% of limit)`);

  return {
    context: contextText.trim(),
    usedChunks,
    totalChunks: results.length,
    totalChars: currentChars,
  };
}

/**
 * Build SYSTEM message (instructions only - no context, no query)
 */
function buildSystemMessage(systemPrompt: string): string {
  return `${systemPrompt}

=== INSTRUCCIONES ===
1. Responde basándote SOLO en la información proporcionada por el usuario.
2. Si la pregunta busca NÚMEROS, FECHAS, PORCENTAJES o ESTADÍSTICAS, búscalos en la información.
3. USA TODA la información proporcionada. Combina de múltiples secciones si es necesario.
4. NUNCA inventes datos. Si no está en la información, di "no encuentro esa información específica".
5. Responde siempre en español, de forma clara y profesional.
6. No incluyas etiquetas como <think> o </think>.
7. Si el mensaje es breve ("sí", "ok", "cuéntame más"), responde a la última pregunta del historial.`;
}

/**
 * Build USER message (context + history + query)
 */
function buildUserMessage(
  context: string,
  usedChunks: number,
  history: string,
  previousQuestion: string,
  query: string,
  contactName?: string
): string {
  const contextHeader = usedChunks > 0
    ? `=== INFORMACIÓN RELEVANTE (${usedChunks} secciones) ===`
    : `=== NO SE ENCONTRÓ INFORMACIÓN RELEVANTE ===`;

  let message = `${contextHeader}
${context || "No hay información disponible."}

`;

  if (history) {
    message += `=== HISTORIAL ===
${history}
Última pregunta: "${previousQuestion}"

`;
  }

  if (contactName && contactName !== "Chat Interno") {
    message += `Contacto: ${contactName}\n`;
  }

  message += `=== MI PREGUNTA ===
${query}`;

  return message;
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

    // 7. Build context with dynamic chunk selection (prevents token overflow)
    const { context, usedChunks, totalChunks } = buildContext(results);

    // 8. Build separate system and user messages
    const systemMessage = buildSystemMessage(systemPrompt);
    const userMessage = buildUserMessage(
      context,
      usedChunks,
      history,
      previousQuestion,
      query,
      contactName
    );

    // 9. Generate LLM response
    const modelService = ModelFactory.getModelService();
    const answer = await modelService.generateText(
      message_id,
      systemMessage,
      userMessage,
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
      chunksUsed: usedChunks,
      chunksTotal: totalChunks,
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
