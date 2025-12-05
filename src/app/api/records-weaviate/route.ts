import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { weaviateClient } from "@/lib/services/weaviate-client";
import { getSaptivaEmbedder } from "@/lib/services/embedders/saptiva-embedder";

/**
 * POST /api/records-weaviate
 * Create a new manual record.
 */
export async function POST(request: Request) {
  try {
    // 1. Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    // 2. Parse request
    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { success: false, error: "Text is required" },
        { status: 400 }
      );
    }

    // 3. Ensure collection exists and generate embedding
    await weaviateClient.ensureUserCollectionExists(userId);
    const collection = await weaviateClient.getUserCollection(userId);

    const embedder = getSaptivaEmbedder();
    const embeddingResult = await embedder.embed(text);

    // 4. Insert into Weaviate
    const properties = {
      sourceName: "Manual",
      uploadDate: new Date().toISOString(),
      chunkIndex: 0,
      totalChunks: 1,
      sourceType: "manual",
      sourceSize: text.length.toString(),
      sourceNamespace: "default",
      text: text.trim(),
      userId,
    };

    await collection.data.insert({
      properties,
      vectors: embeddingResult.embedding,
    });

    console.log("[Records] Created manual record");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Records] Error creating record:", error);
    return NextResponse.json(
      { success: false, error: "Error creating record" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/records-weaviate
 * Get all records for the current user.
 */
export async function GET() {
  try {
    // 1. Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", records: [] },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    // 2. Fetch records from Weaviate
    const collection = await weaviateClient.getUserCollection(userId);
    const response = await collection.query.fetchObjects({ limit: 10000 });

    if (!response?.objects?.length) {
      return NextResponse.json({ success: true, records: [] });
    }

    const records = response.objects.map((obj) => ({
      id: obj.uuid,
      properties: obj.properties,
    }));

    return NextResponse.json({ success: true, records });
  } catch (error) {
    console.error("[Records] Error fetching records:", error);
    return NextResponse.json({
      success: false,
      error: "Error fetching records",
      records: [],
    });
  }
}

/**
 * PUT /api/records-weaviate
 * Update an existing record.
 */
export async function PUT(request: Request) {
  try {
    // 1. Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    // 2. Parse request
    const { id, properties } = await request.json();

    if (!id || typeof properties?.text !== "string") {
      return NextResponse.json(
        { success: false, error: "ID and text are required" },
        { status: 400 }
      );
    }

    // 3. Generate new embedding and update
    const collection = await weaviateClient.getUserCollection(userId);
    const embedder = getSaptivaEmbedder();
    const embeddingResult = await embedder.embed(properties.text);

    await collection.data.update({
      id,
      properties,
      vectors: embeddingResult.embedding,
    });

    console.log(`[Records] Updated record: ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Records] Error updating record:", error);
    return NextResponse.json(
      { success: false, error: "Error updating record" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/records-weaviate
 * Delete a record by ID.
 */
export async function DELETE(request: Request) {
  try {
    // 1. Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    // 2. Parse request and delete
    const { id } = await request.json();

    const collection = await weaviateClient.getUserCollection(userId);
    await collection.data.deleteById(id);

    console.log(`[Records] Deleted record: ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Records] Error deleting record:", error);
    return NextResponse.json(
      { success: false, error: "Error deleting record" },
      { status: 500 }
    );
  }
}
