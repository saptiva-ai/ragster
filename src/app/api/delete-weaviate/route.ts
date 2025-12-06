import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { weaviateClient } from "@/lib/services/weaviate-client";

/**
 * DELETE /api/delete-weaviate
 * Delete a document source and its chunks from Weaviate.
 */
export async function DELETE(req: NextRequest) {
  try {
    // 1. Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Parse request
    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Source name is required" },
        { status: 400 }
      );
    }

    console.log(`[Delete] Deleting source: ${name} for user: ${userId}`);

    // 3. Delete from Weaviate (v2 API)
    await weaviateClient.deleteByFilter(userId, 'sourceName', name);

    // 4. Delete ALL matching records from MongoDB (including failed uploads)
    const { db } = await connectToDatabase();
    const result = await db.collection("file").deleteMany({ filename: name, userId });
    console.log(`[Delete] Removed ${result.deletedCount} MongoDB records`);

    console.log(`[Delete] Deleted source: ${name}`);

    return NextResponse.json({
      success: true,
      message: "Source deleted successfully",
    });

  } catch (error) {
    console.error("[Delete] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error processing request",
      },
      { status: 500 }
    );
  }
}
