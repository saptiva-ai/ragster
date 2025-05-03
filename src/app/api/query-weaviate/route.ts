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

  try {
    const {message_id, query, systemPrompt, modelId, temperature} =
      await req.json();

    if (!query) {
      return NextResponse.json(
        {error: "Se requiere una consulta"},
        {status: 400},
      );
    }

    await collectiondb.insertOne({
      message_id,
      message_role: "user",
      model: modelId,
      message: query,
      temperature: temperature,
      max_tokens: 1000,
      timestamp: new Date(),
    });

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

    // Invertir el orden para que el más reciente esté al principio

    const collection = client.collections.get("DocumentChunk");

    const response = await collection.query.bm25(query, {
      limit: 1,
    });

    console.log("Response:", JSON.stringify(response, null, 2));

    const prompt = `
          Contexto General:
          ${systemPrompt}

          Dispones de:
          - Historial de conversación: "${history}"
          - Última pregunta enviada: "${pregunta}"
          - Mensaje actual del usuario: "${query}"
          - Información relevante de Weaviate: "${response}"

          Instrucciones:

          1. Si el mensaje del usuario es breve o ambiguo (ej. "sí", "ok", "cuéntame más"), asume que responde afirmativamente a la última pregunta enviada.
          2. Responde usando primero la información de "${response}" o el contexto general. No inventes datos. Si no hay información suficiente, responde con algo coherente sobre la respuesta.
          3. Sé breve, claro y enfocado (máximo 90 palabras). Lenguaje sencillo, cálido y profesional.
          4. No repitas preguntas hechas antes (verifica el historial). Si ya preguntaste algo, propone un nuevo ángulo o tema relacionado.
          5. Finaliza siempre con una breve pregunta de seguimiento para mantener la conversación activa.
          6. No expliques intenciones del usuario, responde directamente.

          Recuerda: siempre responde en español.
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
