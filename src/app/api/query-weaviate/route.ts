import { NextRequest, NextResponse } from "next/server";
import { ModelFactory } from "@/lib/services/modelFactory";
import { connectToDatabase } from "@/lib/mongodb/client";
import weaviate from "weaviate-ts-client";
import axios from "axios";
import { MODEL_NAMES } from "@/config/models";

const client = weaviate.client({
  scheme: "http",
  host: process.env.WEAVIATE_HOST || "localhost:8080",
});

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
async function searchInWeaviate(queryText: string) {
  // Crear el embedding del texto de búsqueda
  const queryVector = await getCustomEmbedding(queryText);

  // 🔍 Búsqueda vectorial usando la API GraphQL del cliente actual
  const result = await client.graphql
    .get()
    .withClassName("DocumentChunk")
    .withFields("text")
    .withNearVector({ vector: queryVector })
    .withLimit(10)
    .do();

  console.log("Resultados:", JSON.stringify(result, null, 2));

  const objects = result?.data?.Get?.DocumentChunk ?? [];

  return (objects as Array<{ text?: string }>).map((obj) => ({
    properties: { text: obj.text },
  }));
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
          const chunkText =
            typeof chunk.properties.text === "string"
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

      Historial de conversación: "${history}"
      Última pregunta enviada: "${pregunta}"
      ${
        contactName && contactName !== "Chat Interno"
          ? `Nombre del contacto: "${contactName}"\n`
          : ""
      }
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
