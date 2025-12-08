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
    await weaviateClient.ensureCollectionExists();

    const embedder = getSaptivaEmbedder();
    const embeddingResult = await embedder.embed(text);

    // 4. Insert into Weaviate (v2 API)
    const trimmedText = text.trim();
    const properties = {
      text: trimmedText,
      sourceName: "Manual",
      sourceType: "manual",
      sourceSize: trimmedText.length.toString(),
      sourceNamespace: "default",
      uploadDate: new Date().toISOString(),
      chunkIndex: 1,
      totalChunks: 1,
      prevChunkIndex: null,
      nextChunkIndex: null,
      userId,
      // Schema fields from sentence chunker (with sensible defaults for manual entries)
      language: "en",
      startPosition: 0,
      endPosition: trimmedText.length,
      contentWithoutOverlap: trimmedText,
      chunkerUsed: "manual",
    };

    const id = await weaviateClient.insertObject(properties, embeddingResult.embedding);

    console.log("[Records] Created manual record:", id);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("[Records] Error creating record:", error);
    const message = error instanceof Error ? error.message : "Error creating record";
    return NextResponse.json(
      { success: false, error: message },
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

    // 2. Fetch records from Weaviate (v2 API) - shared collection
    const records = await weaviateClient.getAllObjects(10000);

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

    // 2. Parse request
    const { id, properties } = await request.json();

    if (!id || typeof properties?.text !== "string") {
      return NextResponse.json(
        { success: false, error: "ID and text are required" },
        { status: 400 }
      );
    }

    // 3. Generate new embedding and update (v2 API)
    const embedder = getSaptivaEmbedder();
    const embeddingResult = await embedder.embed(properties.text);

    await weaviateClient.updateObject(id, properties, embeddingResult.embedding);

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

    // 2. Parse request and delete (v2 API)
    const { id } = await request.json();

    await weaviateClient.deleteObject(id);

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
