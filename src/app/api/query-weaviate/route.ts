import { NextRequest, NextResponse } from "next/server";
import { ModelFactory } from "@/lib/services/modelFactory";
import { connectToDatabase } from "@/lib/mongodb/client";
import weaviate, { WeaviateClient } from "weaviate-client";
import axios from "axios";

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
  const response = await axios.post(
    embeddingApiUrl,
    {
      model: "Saptiva Embed",
      prompt: text,
      stream: false,
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
    limit: 2,
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

    let text = "";
    if (response.length > 0) {
      text =
        typeof response[0].properties.text === "string"
          ? response[0].properties.text
          : "";
    }

    const prompt = `
      Contexto General:
      ${systemPrompt}

      Dispones de:
      
      Historial de conversación: "${history}"
      Última pregunta enviada: "${pregunta}"
      ${contactName && contactName !== "Chat Interno" ? `Nombre del contacto: "${contactName}"\n` : ""}
      Mensaje actual del usuario: "${query}"
      Información relevante de Weaviate: "${text}"

      Instrucciones:
 
      1. Si el mensaje del usuario es breve o ambiguo (ej. "sí", "ok", "cuéntame más"), asume que responde afirmativamente a la última pregunta enviada.
      2. Solo si el mensaje del usuario NO cumple con la opción 1, responde usando la siguiente respuesta añadiendo contexto: "${text || ""}".
      3. Sé claro y enfocado (máximo 190 palabras). Lenguaje sencillo, cálido y profesional.
      4. No repitas preguntas hechas antes (verifica el historial). Si ya preguntaste algo, propone un nuevo ángulo o tema relacionado.
      5. No expliques intenciones del usuario, responde directamente.
      6. Bajo ninguna circunstancia inventes datos.
      7. Siempre responde en español.
      8. No incluyas etiquetas y secciones como <think> o </think> en la respuesta.`;

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
