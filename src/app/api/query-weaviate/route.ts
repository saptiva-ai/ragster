import {NextRequest, NextResponse} from "next/server";
import {ModelFactory} from "@/lib/services/modelFactory";
import {connectToDatabase} from "@/lib/mongodb/client";

import weaviate, {WeaviateClient} from "weaviate-client";

const weaviateApiKey = process.env.WEAVIATE_API_KEY!;

function extraerPregunta(texto: string): string | null {
  const regex = /¿(.*?)\?/;
  const match = texto.match(regex);

  if (match && match[1]) {
    return `¿${match[1]}?`;
  } else {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const {db} = await connectToDatabase();
  const collectiondb = db.collection("messages");

  const client: WeaviateClient = await weaviate.connectToWeaviateCloud(
    process.env.WEAVIATE_HOST!,
    {
      authCredentials: new weaviate.ApiKey(weaviateApiKey),
      headers: {
        "X-Openai-Api-Key": process.env.OPENAI_API_KEY!,
      },
    },
  );
  let pregunta = "";
  let history = "";
  let response = [];

  try {
    const {message_id, query, systemPrompt, modelId, temperature} =
      await req.json();

    if (!query) {
      return NextResponse.json(
        {error: "Se requiere una consulta"},
        {status: 400},
      );
    }

    console.log(`Processing query: "${query}"`);

    await collectiondb.insertOne({
      message_id,
      message_role: "user",
      model: modelId,
      message: query,
      temperature: temperature,
      max_tokens: 1000,
      timestamp: new Date(),
    });

    // Removed invalid method call as 'getSchema' does not exist on 'client.cluster.nodes'
    // If schema information is needed, use a valid method or API call from the Weaviate client.

    const messages = await collectiondb
      .find({message_id})
      .sort({_id: -1}) // Orden descendente por _id (más recientes primero)
      .limit(5)
      .toArray();

    console.log("Mensajes encontrados:", messages[0].message);

    if (messages.length > 1) {
      pregunta = extraerPregunta(messages[1].message) || "";
      console.log("Pregunta extraída:", pregunta);

      messages.reverse();

      history = messages
        .map(
          (message) =>
            `- Role: ${message.message_role} \n  - Mensaje: ${message.message}`,
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

    const collection = client.collections.get("DocumentChunk");

    if (ambiguous_words.includes(normalizedQuery)) {
      console.log("Consulta ambigua detectada:", normalizedQuery);

      if (pregunta) {
        const bm25Response = await collection.query.bm25(pregunta, {
          limit: 1,
        });

        response = bm25Response.objects || [];
      } else {
        response = [] as Array<{properties: {text: string}}>;
      }
    } else {
      const bm25Response = await collection.query.bm25(query, {
        limit: 1,
      });

      response = bm25Response.objects || [];
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
      Mensaje actual del usuario: "${query}"
      Información relevante de Weaviate: "${text}"

      Instrucciones:
 
      1. Si el mensaje del usuario es breve o ambiguo (ej. "sí", "ok", "cuéntame más"), asume que responde afirmativamente a la última pregunta enviada.
      2. Solo si el mensaje del usuario NO cumple con la opción 1, responde usando la siguiente respuesta añadiendo contexto: "${
        text ? text.split("Respuesta:")[1]?.trim() : ""
      }".
      3. Sé claro y enfocado (máximo 190 palabras). Lenguaje sencillo, cálido y profesional.
      4. No repitas preguntas hechas antes (verifica el historial). Si ya preguntaste algo, propone un nuevo ángulo o tema relacionado.
      5. No expliques intenciones del usuario, responde directamente.
      6. Bajo ninguna circunstancia inventes datos 
      7. siempre responde en español.
      `;

    console.log("Enhanced Prompt:", prompt);

    // Llamar al modelo para generar una respuesta
    const modelService = ModelFactory.getModelService();
    const answer = await modelService.generateText(
      message_id,
      prompt,
      query,
      modelId || "Qwen",
      temperature || 0.3,
    );

    return NextResponse.json({
      success: true,
      query: query,
      matches: [],
      answer: answer,
      model: modelId || "Qwen",
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
