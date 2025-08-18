import { NextResponse } from "next/server";
import weaviate, { WeaviateClient } from "weaviate-client";
import { connectToDatabase } from "@/lib/mongodb/client";
import axios from "axios";

const weaviateApiKey = process.env.WEAVIATE_API_KEY!;
const embeddingApiUrl = process.env.EMBEDDING_API_URL!;
const saptivaApiKey = process.env.SAPTIVA_API_KEY!;

// Función para generar embedding con tu API
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

export async function GET() {
  const client: WeaviateClient = await weaviate.connectToWeaviateCloud(
    process.env.WEAVIATE_HOST!,
    {
      authCredentials: new weaviate.ApiKey(weaviateApiKey),
    }
  );
  const { db } = await connectToDatabase();
  const fileColection = db.collection("file");

  try {
    const coll = await client.collections.listAll();

    if (!coll || coll.length === 0) {
      return NextResponse.json({
        success: true,
        sources: [],
      });
    }

    const collection = client.collections.get(coll[0].name);

    // 🔹 Generar embedding manualmente
    const queryVector = await getCustomEmbedding(
      "Lista de todas las fuentes disponibles"
    );

    // 🔹 Usar nearVector en vez de nearText
    const response = await collection.query.nearVector(queryVector, {
      limit: 2,
    });

    if (!response || !response.objects || response.objects.length === 0) {
      return NextResponse.json({
        success: true,
        sources: [],
      });
    }

    const data = [response.objects[0].properties];
    data[0].id = response.objects[0].uuid;

    const file = await fileColection.findOne({
      status: 2,
    });

    console.log("Archivo:", file);

    return NextResponse.json({
      success: true,
      sources: data,
      fileIdFromWeaviate: data.length > 0 ? data[0].id : null,
      fileExistsInDB: !!file
    });

  } catch (error) {
    console.error("Error al consultar:", error);
    return NextResponse.json({
      success: true,
      error: "Error al consultar",
      sources: [],
    });
  }
}
