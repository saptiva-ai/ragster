import { NextRequest, NextResponse } from "next/server";
import { ModelFactory } from "@/lib/services/modelFactory";
import { connectToDatabase } from "@/lib/mongodb/client";
import weaviate, { WeaviateClient } from "weaviate-client";
import axios from "axios";
import { MODEL_NAMES } from "@/config/models";

const weaviateApiKey = process.env.WEAVIATE_API_KEY!;
const embeddingApiUrl = process.env.EMBEDDING_API_URL!;
const saptivaApiKey = process.env.SAPTIVA_API_KEY!;

// Cliente Weaviate
const client: WeaviateClient = await weaviate.connectToWeaviateCloud(
  process.env.WEAVIATE_HOST!,
  {
    authCredentials: new weaviate.ApiKey(weaviateApiKey),
  }
);

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
    embeddingApiUrl,
    {
      model: MODEL_NAMES.EMBEDDING,
      prompt: text,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${saptivaApiKey}`,
      },
    }
  );

  if (!response.data || !Array.isArray(response.data.embeddings)) {
    throw new Error("Formato de embedding inválido");
  }

  return response.data.embeddings;
}

// Busca en Weaviate usando nearVector
async function searchInWeaviate(queryText: string) {
  const collection = client.collections.get("DocumentChunk");
  const queryVector = await getCustomEmbedding(queryText);

  const result = await collection.query.nearVector(queryVector, {
    limit: 10, // Increased from 2 to 10 for better context coverage
  });

  console.log("Resultados:", JSON.stringify(result, null, 2));
  return result.objects as { properties: { text?: string } }[];
}
export async function POST(req: NextRequest) {
  const { db } = await connectToDatabase();
  const collectiondb = db.collection("messages");

  let pregunta = "";
  let history = "";
  let response: { properties: { text?: string } }[] = [];

  try {
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

    console.log(`Processing query: "${query}" from: ${contactName}`);

    // Guardar mensaje en base de datos
    await collectiondb.insertOne({
      message_id,
      message_role: "user",
      model: modelId,
      message: query,
      temperature: temperature,
      max_tokens: 1000,
      timestamp: new Date(),
      contact_name: contactName, // Guardar el nombre aquí
    });

    const messages = await collectiondb
      .find({ message_id })
      .sort({ _id: -1 })
      .limit(5)
      .toArray();

    if (messages.length > 1) {
      pregunta = extraerPregunta(messages[1].message) || "";
      console.log("Pregunta extraída:", pregunta);

      messages.reverse();
      history = messages
        .map(
          (message) =>
            `- Role: ${message.message_role} \n  - Mensaje: ${message.message}`
        )
        .join("\n");
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
        response = (await searchInWeaviate(pregunta)) || [];
      } else {
        response = [];
      }
    } else {
      response = (await searchInWeaviate(query)) || [];
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
          return `[Fragmento ${index + 1}]:\n${chunkText}`;
        })
        .join("\n\n---\n\n");
    }

    const prompt = `
      Contexto General:
      ${systemPrompt}

      === INFORMACIÓN RELEVANTE DE LOS DOCUMENTOS ===
      ${text}

      === INSTRUCCIONES CRÍTICAS ===

      1. 🔢 PRIORIDAD ABSOLUTA: Si la pregunta busca NÚMEROS, FECHAS, PORCENTAJES o ESTADÍSTICAS, búscalos en TODOS los fragmentos anteriores.
      2. 📍 CITA la fuente: Cuando uses datos específicos, menciona "Según Fragmento X..." para dar trazabilidad.
      3. ✅ USA TODOS los fragmentos: No te limites al primero. Combina información de múltiples fragmentos si es necesario.
      4. ❌ NO digas "no hay información" o "no se puede determinar" sin haber revisado TODOS los fragmentos primero.
      5. 🎯 Para preguntas de "por qué" o "cómo", sintetiza información de varios fragmentos.
      6. 💬 Lenguaje claro y profesional, máximo 250 palabras.
      7. 🚫 NUNCA inventes datos. Si realmente no está en los fragmentos, di claramente "no encuentro esa información específica en los documentos".
      8. 🇪🇸 Responde siempre en español.
      9. ⚠️ No incluyas etiquetas como <think> o </think>.
      10. 📝 Si el mensaje es breve ("sí", "ok", "cuéntame más"), asume que responde afirmativamente a la última pregunta.

      Historial de conversación: "${history}"
      Última pregunta enviada: "${pregunta}"
      ${contactName && contactName !== "Chat Interno" ? `Nombre del contacto: "${contactName}"\n` : ""}
      Mensaje actual del usuario: "${query}"`;

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
