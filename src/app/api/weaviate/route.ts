import { NextResponse } from "next/server";
import weaviate from "weaviate-ts-client";
import { connectToDatabase } from "@/lib/mongodb/client";

type WeaviateObject = {
  id?: string;
  uuid?: string;
  properties?: Record<string, unknown>;
};

const client = weaviate.client({
  scheme: "http",
  host: process.env.WEAVIATE_HOST || "localhost:8080",
});

export async function GET() {
  const { db } = await connectToDatabase();
  const fileColection = db.collection("file");

  try {
    // Get all files from MongoDB (not just one)
    const files = await fileColection
      .find({
        status: { $in: [1, 2] },
      })
      .toArray();

    // 🔹 List all collections in Weaviate
    const schema = await client.schema.getter().do();

    if (!schema.classes || schema.classes.length === 0) {
      return NextResponse.json({
        success: true,
        sources: [],
        files: files || [],
      });
    }

    const className = schema.classes[0]?.class;

    if (!className) {
      return NextResponse.json({
        success: true,
        sources: [],
        files: files || [],
      });
    }

    // 🔹 Fetch all objects from the first class in the schema
    const response = await client.data
      .getter()
      .withClassName(className)
      .withLimit(1000)
      .do();

    // 🔹 Group by sourceName to get unique documents
    type SourceData = {
      id: string;
      chunkIndex: number;
      [key: string]: unknown;
    };

    const sourceMap = new Map<string, SourceData>();

    (response.objects || []).forEach((obj: WeaviateObject) => {
      const sourceName = obj.properties?.sourceName;

      if (typeof sourceName !== "string" || !sourceName) return;

      if (!sourceMap.has(sourceName)) {
        sourceMap.set(sourceName, {
          id: (obj.id || obj.uuid) as string,
          ...(obj.properties || {}),
          chunkIndex: 1,
        });
      } else {
        const existing = sourceMap.get(sourceName)!;
        existing.chunkIndex += 1;
        sourceMap.set(sourceName, existing);
      }
    });

    const data = Array.from(sourceMap.values());

    return NextResponse.json({
      success: true,
      sources: data,
      files: files, // Return all files instead of just one
    });
  } catch (error) {
    console.error("Error al consultar:", error);
    return NextResponse.json({
      success: false,
      error: "Error al consultar",
      sources: [],
      files: [],
    });
  }
}
