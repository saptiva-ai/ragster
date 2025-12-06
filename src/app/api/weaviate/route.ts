import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { weaviateClient } from "@/lib/services/weaviate-client";

export async function GET() {
  try {
    // 1. Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized", files: [] }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Get files from MongoDB filtered by userId
    const { db } = await connectToDatabase();
    const fileCollection = db.collection("file");
    const files = await fileCollection
      .find({
        userId: userId,
        status: { $in: [1, 2] },
      })
      .toArray();

    // 3. Get all objects from user's Weaviate collection
    const objects = await weaviateClient.getAllObjects(userId, 1000);

    // 4. Group by sourceName to get unique documents
    type SourceData = {
      id: string;
      chunkIndex: number;
      [key: string]: unknown;
    };

    const sourceMap = new Map<string, SourceData>();

    objects.forEach((obj) => {
      const sourceName = obj.properties?.sourceName;

      if (typeof sourceName !== "string" || !sourceName) return;

      if (!sourceMap.has(sourceName)) {
        sourceMap.set(sourceName, {
          id: obj.id,
          ...(obj.properties || {}),
          chunkIndex: 1,
        });
      } else {
        const existing = sourceMap.get(sourceName)!;
        existing.chunkIndex += 1;
        sourceMap.set(sourceName, existing);
      }
    });

    const sources = Array.from(sourceMap.values());

    return NextResponse.json({
      success: true,
      sources,
      files,
    });
  } catch (error) {
    console.error("[Weaviate API] Error:", error);
    return NextResponse.json({
      success: false,
      error: "Error fetching documents",
      sources: [],
      files: [],
    });
  }
}
