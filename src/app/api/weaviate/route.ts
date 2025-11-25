import { NextResponse } from "next/server";
import weaviate, { WeaviateClient } from "weaviate-client";
import { connectToDatabase } from "@/lib/mongodb/client";
import axios from "axios";
import { MODEL_NAMES } from "@/config/models";

const weaviateApiKey = process.env.WEAVIATE_API_KEY!;
const embeddingApiUrl = process.env.EMBEDDING_API_URL!;
const saptivaApiKey = process.env.SAPTIVA_API_KEY!;

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

    // 🔹 Fetch all objects from the collection
    const response = await collection.query.fetchObjects({
      limit: 1000,
    });

    // 🔹 Group by sourceName to get unique documents
    const sourceMap = new Map();
    response.objects.forEach((obj) => {
      const sourceName = obj.properties.sourceName;
      if (!sourceMap.has(sourceName)) {
        sourceMap.set(sourceName, {
          id: obj.uuid,
          ...obj.properties,
          chunkIndex: 1,
        });
      } else {
        sourceMap.get(sourceName).chunkIndex += 1;
      }
    });

    const data = Array.from(sourceMap.values());

    const file = await fileColection.findOne({
      status: { $in: [1, 2] },
    });

    return NextResponse.json({
      success: true,
      sources: data,
      fileIdFromWeaviate: data.length > 0 ? data[0].id : null,
      fileExistsInDB: file,
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
