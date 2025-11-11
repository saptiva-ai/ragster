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
    returnMetadata: ['distance', 'certainty'], // Request similarity scores
  });

  console.log("Resultados:", JSON.stringify(result, null, 2));

  // GUARDRAIL: Filter by similarity threshold
  const SIMILARITY_THRESHOLD = 0.5; // Lowered from 0.65 to 0.5 for better recall
  const filteredResults = result.objects.filter((obj: any) => {
    // Try multiple ways to extract score from Weaviate response
    let score = 0;

    if (obj.metadata?.certainty) {
      // Some Weaviate configs return certainty (0-1, higher is better)
      score = obj.metadata.certainty;
    } else if (obj.metadata?.distance !== undefined) {
      // Others return distance (lower is better, needs inversion)
      score = 1 - obj.metadata.distance;
    } else if (obj.metadata?.score !== undefined) {
      // Some return score directly
      score = obj.metadata.score;
    }

    console.log(`Chunk score: ${score.toFixed(3)} (threshold: ${SIMILARITY_THRESHOLD})`);
    return score >= SIMILARITY_THRESHOLD;
  });

  console.log(`✅ Filtered results: ${filteredResults.length}/${result.objects.length} chunks passed threshold (≥${SIMILARITY_THRESHOLD})`);

  if (filteredResults.length === 0 && result.objects.length > 0) {
    console.log("⚠️ All chunks filtered out due to low scores - check if threshold is too high");
  }

  return filteredResults as { properties: { text?: string } }[];
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

    // GUARDRAIL: Check if we have relevant results
    if (!response || response.length === 0) {
      console.log("⚠️ No relevant documents found - returning 'no info' message");
      return NextResponse.json({
        success: true,
        query: query,
        matches: [],
        answer: "Disculpa, no tengo datos suficientes para responder tu pregunta en estos momentos.",
        modelId: modelId,
        provider: "saptiva",
      });
    }

    // === RERANKER HÍBRIDO: Semántico + Léxico + Headers - Contaminación ===
    const norm = (s: string) => (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[¿?¡!.,;:()"]/g, " ");

    const qWords = Array.from(new Set(
      norm(query).split(/\s+/).filter(w => w.length > 3)
    ));

    // Frases de contaminación genérica (otros trámites no relacionados)
    const genericNegs = ["cambio de domicilio", "71/cff", "77/cff", "actualización de actividades", "71 cff", "apertura de establecimiento", "cierre de establecimiento"];

    const rankedChunks = response.map((ch: any) => {
      const text = ch.properties?.text || "";
      const t = norm(text);

      // 1) Score léxico por palabras de la query
      let kw = 0;
      qWords.forEach(w => {
        if (t.includes(w)) kw += 1;
      });

      // 2) Boost por "frases fuertes" detectadas del propio chunk (encabezados)
      const headers = (text.match(/^#{2,3}\s.*$/gm) || [])
        .map(h => norm(h.replace(/^#+\s*/, "")));
      let boost = 0;
      headers.forEach(h => {
        qWords.forEach(w => {
          if (h.includes(w)) boost += 1;
        });
      });

      // 3) Penalización por términos genéricos NO mencionados en la query
      let pen = 0;
      genericNegs.forEach(neg => {
        if (t.includes(neg) && !qWords.some(w => neg.includes(w) || w.includes(neg))) {
          pen += 2;
        }
      });

      // 4) Señal semántica (de Weaviate distance)
      const sem = 1 - (ch.metadata?.distance ?? 0.5);

      // Score final híbrido
      const score = 0.4 * sem + 0.4 * kw + 0.3 * boost - 0.6 * pen;

      return {
        ch,
        score,
        text,
        debug: { sem: sem.toFixed(2), kw, boost, pen }
      };
    })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Top 5 chunks

    console.log(`📊 Hybrid reranking: ${rankedChunks.map(r => `score=${r.score.toFixed(2)} (sem:${r.debug.sem} kw:${r.debug.kw} boost:${r.debug.boost} pen:${r.debug.pen})`).join(', ')}`);

    // Combine top-5 chunks into context
    let text = "";
    if (rankedChunks.length > 0) {
      text = rankedChunks
        .map((item, index) => {
          return `[Sección ${index + 1}]:\n${item.text}`;
        })
        .join("\n\n---\n\n");
    }

    const prompt = `
      === REGLAS ABSOLUTAS (NO NEGOCIABLES) ===

      1. RESPONDE EXCLUSIVAMENTE con información de las secciones de documentos proporcionadas abajo.
      2. ESTÁ PROHIBIDO usar conocimiento externo, experiencia previa, o información general.
      3. Si una información NO aparece textualmente en las secciones, responde: "Disculpa, no tengo datos suficientes para responder esa pregunta en estos momentos."
      4. NUNCA inventes: URLs, pasos, requisitos, nombres de trámites, o cualquier dato.
      5. Si hay información parcial, di SOLO lo que está en las secciones y aclara qué falta.

      === INFORMACIÓN RELEVANTE DE LOS DOCUMENTOS ===
      ${text}

      === FORMATO DE RESPUESTA REQUERIDO ===

      - Usa SOLO la información de arriba
      - Cita los pasos y requisitos EXACTAMENTE como aparecen
      - Si mencionas una URL, portal, correo o trámite, debe estar en las secciones de arriba
      - Si algo no está en las secciones, NO lo menciones
      - Lenguaje claro y profesional
      - No incluyas etiquetas como <think> o </think>

      === CONTEXTO DE CONVERSACIÓN ===
      Historial: "${history}"
      ${pregunta ? `Pregunta anterior: "${pregunta}"` : ""}
      ${contactName && contactName !== "Chat Interno" ? `Contacto: "${contactName}"` : ""}

      === PREGUNTA ACTUAL ===
      ${query}

      === TU RESPUESTA (SOLO BASADA EN LAS SECCIONES DE ARRIBA) ===`;

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
