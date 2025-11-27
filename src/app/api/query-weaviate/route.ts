import { NextRequest, NextResponse } from "next/server";
import { ModelFactory } from "@/lib/services/modelFactory";
import { connectToDatabase } from "@/lib/mongodb/client";
import weaviate, { WeaviateClient } from "weaviate-client";
import axios from "axios";
import { MODEL_NAMES } from "@/config/models";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Cliente Weaviate (lazy initialization)
let client: WeaviateClient | null = null;

async function getWeaviateClient(): Promise<WeaviateClient> {
  if (!client) {
    client = await weaviate.connectToWeaviateCloud(
      process.env.WEAVIATE_HOST!,
      {
        authCredentials: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY!),
      }
    );
  }
  return client;
}

// Extrae pregunta de un texto
function extraerPregunta(texto: string): string | null {
  const regex = /¿(.*?)\?/;
  const match = texto.match(regex);
  return match && match[1] ? `¿${match[1]}?` : null;
}

// Genera embedding con Saptiva
async function getCustomEmbedding(text: string): Promise<number[]> {
  // Fixed: Removed "stream: false" - SAPTIVA Embed API only accepts "model" and "prompt"
  const response = await axios.post(
    process.env.EMBEDDING_API_URL!,
    {
      model: MODEL_NAMES.EMBEDDING,
      prompt: text,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SAPTIVA_API_KEY!}`,
      },
    }
  );

  if (!response.data || !Array.isArray(response.data.embeddings)) {
    throw new Error("Formato de embedding inválido");
  }

  return response.data.embeddings;
}

// Busca en Weaviate usando nearVector
async function searchInWeaviate(queryText: string, userId: string) {
  const weaviateClient = await getWeaviateClient();
  const collection = weaviateClient.collections.get("DocumentChunk");
  const queryVector = await getCustomEmbedding(queryText);

  const result = await collection.query.nearVector(queryVector, {
    limit: 10,
    filters: weaviate.filter.byProperty("userId").equal(userId),
  });

  console.log("Resultados:", JSON.stringify(result, null, 2));
  return result.objects as { properties: { text?: string } }[];
}
export async function POST(req: NextRequest) {
  const { db } = await connectToDatabase();
  const collectiondb = db.collection("messages");

  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    let pregunta = "";
    let history = "";
    let response: { properties: { text?: string } }[] = [];

    const body = await req.json();

    const {
      message_id,
      query,
      systemPrompt,
      modelId,
      temperature,
      contacts = [],
    } = body;

    const contactName = contacts?.[0]?.profile?.name || "Chat Interno";

    if (!query) {
      return NextResponse.json(
        { error: "Se requiere una consulta" },
        { status: 400 }
      );
    }

    console.log(`Processing query: "${query}" from: ${contactName} (User: ${userId})`);

    // Guardar mensaje actual en base de datos
    await collectiondb.insertOne({
      message_id,
      message_role: "user",
      model: modelId,
      message: query,
      temperature: temperature,
      max_tokens: 1000,
      timestamp: new Date(),
      contact_name: contactName,
      user_id: userId,
    });

    // Recuperar historial estructurado (últimos 6 mensajes = 3 turnos de intercambio aprox)
    // Filtrando por message_id y user_id para seguridad y contexto correcto
    const rawMessages = await collectiondb
      .find({ message_id, user_id: userId })
      .sort({ _id: -1 })
      .limit(6) 
      .toArray();

    // Ordenar cronológicamente (más antiguo primero) y excluir el mensaje actual que acabamos de insertar
    // para no duplicarlo (ya que se envía como 'query' en generateText)
    const historyMessages = rawMessages
      .reverse()
      .filter(msg => msg.message !== query) // Simple check to avoid duplication if DB is fast enough
      .map((msg) => ({
        role: msg.message_role,
        content: msg.message,
      }));

    // Lógica para preguntas ambiguas (mantener para RAG)
    if (rawMessages.length > 1) {
      // Buscar la última pregunta del usuario en el historial
      const lastUserMsg = [...rawMessages].reverse().find(m => m.message_role === 'user' && m.message !== query);
      if (lastUserMsg) {
        pregunta = lastUserMsg.message; // Usar el mensaje completo en lugar de regex frágil
      }
    }

    const ambiguous_words = [
      "si",
      "sí",
      "ok",
      "cuéntame más",
      "claro",
      "entendido",
      "perfecto",
      "de acuerdo",
      "vale",
      "genial",
      "bueno",
      "está bien",
      "sí, claro",
      "sí, por supuesto",
      "si, claro",
      "si, por supuesto",
    ];

    const normalizedQuery = query.trim().toLowerCase();

    if (ambiguous_words.includes(normalizedQuery)) {
      console.log("Consulta ambigua detectada:", normalizedQuery);
      if (pregunta) {
        response = (await searchInWeaviate(pregunta, userId)) || [];
      } else {
        response = [];
      }
    } else {
      response = (await searchInWeaviate(query, userId)) || [];
    }

    console.log("Response:", JSON.stringify(response, null, 2));

    // Combine ALL retrieved chunks into context
    let text = "";
    if (response.length > 0) {
      text = response
        .map((chunk, index) => {
          const chunkText = typeof chunk.properties.text === "string"
            ? chunk.properties.text
            : "";
          return `[Sección ${index + 1}]:\n${chunkText}`;
        })
        .join("\n\n---\n\n");
    }

    const prompt = `
      Contexto General:
      ${systemPrompt}

      === INFORMACIÓN RELEVANTE DE LOS DOCUMENTOS ===
      ${text}

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

      ${contactName && contactName !== "Chat Interno" ? `Nombre del contacto: "${contactName}"\n` : ""}`;

    const modelService = ModelFactory.getModelService();
    const answer = await modelService.generateText(
      message_id,
      prompt,
      query,
      modelId,
      temperature || 0.3,
      1000,
      historyMessages // Pasar historial estructurado
    );

    return NextResponse.json({
      success: true,
      query: query,
      matches: [],
      answer: answer,
      modelId,
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
      { status: 500 }
    );
  }
}
