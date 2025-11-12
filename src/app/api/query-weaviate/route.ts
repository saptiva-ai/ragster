import { NextRequest, NextResponse } from "next/server";
import { ModelFactory } from "@/lib/services/modelFactory";
import { connectToDatabase } from "@/lib/mongodb/client";
import weaviate, { WeaviateClient } from "weaviate-client";
import axios from "axios";
import { MODEL_NAMES } from "@/config/models";
import {
  normalizeText,
  extractHeader,
  extractQueryTerms,
  countTermMatches,
} from "@/lib/retrieval/helpers";
import { selectDiverseChunks, MMRCandidate } from "@/lib/retrieval/mmr";

// Type definition for Weaviate query results
interface WeaviateQueryObject {
  properties: {
    text?: string;
    sourceName?: string;
    sourceType?: string;
    chunkIndex?: number;
    [key: string]: unknown;
  };
  metadata?: {
    score?: number;
    certainty?: number;
    distance?: number;
    [key: string]: unknown;
  };
}

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

  // Use hybrid search with RRF fusion (semantic + BM25)
  const result = await collection.query.hybrid(queryText, {
    limit: 20, // Retrieve more candidates for fusion (conservative: 20)
    alpha: 0.5, // Balance: 0 = pure BM25, 1 = pure vector, 0.5 = balanced
    vector: queryVector, // Provide pre-computed embedding for semantic search
    returnMetadata: ['score', 'distance'], // Get both RRF score and distance
  });

  console.log("Hybrid search results:", JSON.stringify(result, null, 2));

  // GUARDRAIL: Filter by minimum score threshold
  // Note: Hybrid search returns normalized RRF scores (0-1)
  const SIMILARITY_THRESHOLD = 0.3; // Lower threshold for hybrid (RRF scores differ from pure vector)
  const filteredResults = result.objects.filter((obj: WeaviateQueryObject) => {
    // Hybrid search returns score in metadata
    let score = 0;

    if (obj.metadata?.score !== undefined) {
      // Hybrid RRF score (0-1, higher is better)
      score = obj.metadata.score;
    } else if (obj.metadata?.certainty) {
      score = obj.metadata.certainty;
    } else if (obj.metadata?.distance !== undefined) {
      // Fallback to distance if score not available
      score = 1 - obj.metadata.distance;
    }

    console.log(`Chunk RRF score: ${score.toFixed(3)} (threshold: ${SIMILARITY_THRESHOLD})`);
    return score >= SIMILARITY_THRESHOLD;
  });

  console.log(`✅ Filtered results: ${filteredResults.length}/${result.objects.length} chunks passed threshold (≥${SIMILARITY_THRESHOLD})`);

  if (filteredResults.length === 0 && result.objects.length > 0) {
    console.log("⚠️ All chunks filtered out due to low scores - check if threshold is too high");
  }

  return filteredResults as WeaviateQueryObject[];
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

    // === FUSION RERANKER: RRF + Header Boost + Lexical Overlap + Contamination Filter ===
    // Normalize query and extract terms
    const qNorm = normalizeText(query);
    const qTerms = extractQueryTerms(qNorm);

    console.log(`Query terms: [${qTerms.join(", ")}]`);

    // Frases de contaminación genérica (otros trámites no relacionados)
    const genericNegs = [
      "cambio de domicilio",
      "71/cff",
      "77/cff",
      "actualización de actividades",
      "71 cff",
      "apertura de establecimiento",
      "cierre de establecimiento",
    ];

    // Step 1: Fusion reranking with header boost and lexical overlap
    const fusedChunks = response.map((ch: WeaviateQueryObject) => {
      const text = ch.properties?.text || "";
      const textNorm = normalizeText(text);

      // 1) Get RRF score from Weaviate hybrid search
      const rrfScore = ch.metadata?.score ?? 0;

      // 2) Semantic signal from distance (fallback)
      const semantic = 1 - (ch.metadata?.distance ?? 0.5);

      // 3) Header boost: count query terms in chunk headers
      const header = extractHeader(text);
      const headerMatch = countTermMatches(qTerms, header);

      // 4) Lexical overlap: count query terms in chunk text
      const overlap = countTermMatches(qTerms, textNorm);

      // 5) Contamination penalty: detect off-topic terms
      let contaminationPenalty = 0;
      genericNegs.forEach((neg) => {
        if (
          textNorm.includes(normalizeText(neg)) &&
          !qTerms.some((w) => neg.includes(w) || w.includes(neg))
        ) {
          contaminationPenalty += 2;
        }
      });

      // Combined fusion score
      // Weights: 55% RRF, 30% semantic, 10% header, 5% overlap, minus contamination
      const score =
        0.55 * rrfScore +
        0.3 * semantic +
        0.1 * headerMatch +
        0.05 * overlap -
        0.6 * contaminationPenalty;

      return {
        ch,
        score,
        text,
        textNorm,
        debug: {
          rrf: rrfScore.toFixed(3),
          sem: semantic.toFixed(3),
          header: headerMatch,
          overlap,
          contamination: contaminationPenalty,
        },
      };
    })
      .sort((a, b) => b.score - a.score)
      .slice(0, 15); // Keep top 15 for MMR diversity selection

    console.log(
      "Fused chunks (top 15):",
      fusedChunks.map((c) => ({
        score: c.score.toFixed(3),
        debug: c.debug,
      }))
    );

    // Step 2: MMR diversity selection (15 → 5 chunks)
    type FusedChunk = typeof fusedChunks[0];
    const mmrCandidates: MMRCandidate<FusedChunk>[] = fusedChunks.map((item, index) => ({
      id: `chunk-${index}`,
      normalizedText: item.textNorm,
      score: item.score,
      originalData: item,
    }));

    const diverseChunks = selectDiverseChunks(
      mmrCandidates,
      5, // Select top 5 diverse chunks
      0.7 // Lambda: 70% relevance, 30% diversity
    );

    console.log(`MMR selected ${diverseChunks.length} diverse chunks`);

    // Extract the ranked chunks from MMR results
    const rankedChunks = diverseChunks;

    console.log(
      `📊 Fusion + MMR reranking: ${rankedChunks
        .map(
          (r) =>
            `score=${r.score.toFixed(2)} (rrf:${r.debug.rrf} sem:${r.debug.sem} header:${r.debug.header} overlap:${r.debug.overlap} contamination:${r.debug.contamination})`
        )
        .join(", ")}`
    );

    // Combine top-5 diverse chunks into context
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
