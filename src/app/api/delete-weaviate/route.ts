import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { weaviateClient } from "@/lib/services/weaviate-client";
import { ObjectId } from "mongodb";

/**
 * DELETE /api/delete-weaviate
 * Delete a document source and its chunks from Weaviate.
 *
 * Supports two modes:
 * 1. Delete by mongoId (single document) - for force delete of stuck docs
 * 2. Delete by name (all docs with that name) - for normal delete
 */
export async function DELETE(req: NextRequest) {
  try {
    // 1. Authentication (supports API key or session)
    const auth = await validateRequest(req);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    // 2. Parse request
    const body = await req.json();
    const { name, mongoId, deleteWeaviate = true } = body;

    if (!name && !mongoId) {
      return NextResponse.json(
        { error: "Source name or mongoId is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Mode 1: Delete single document by MongoDB ID (for stuck docs)
    if (mongoId) {
      console.log(`[Delete] Force deleting single document by mongoId: ${mongoId}`);

      // Get the document first to check its status
      const doc = await db.collection("file").findOne({ _id: new ObjectId(mongoId) });

      if (!doc) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      // Only delete from Weaviate if document was completed (status=2) and deleteWeaviate is true
      if (doc.status === 2 && deleteWeaviate) {
        // Delete from BOTH collections (regular + QnA)
        const [regularDeleted, qnaDeleted] = await Promise.all([
          weaviateClient.deleteByFilter('sourceName', doc.filename),
          weaviateClient.deleteByFilterQnA('sourceName', doc.filename),
        ]);
        console.log(`[Delete] Removed ${regularDeleted} regular + ${qnaDeleted} QnA chunks from Weaviate for ${doc.filename}`);
      } else {
        console.log(`[Delete] Skipping Weaviate delete (status=${doc.status}, doc was not completed)`);
      }

      // Delete from MongoDB
      await db.collection("file").deleteOne({ _id: new ObjectId(mongoId) });
      console.log(`[Delete] Removed MongoDB record: ${mongoId}`);

      return NextResponse.json({
        success: true,
        message: "Document deleted successfully",
        deletedDoc: doc.filename,
      });
    }

    // Mode 2: Delete all documents by name (original behavior)
    console.log(`[Delete] Deleting all documents named: ${name}`);

    // Delete from BOTH Weaviate collections
    if (deleteWeaviate) {
      const [regularDeleted, qnaDeleted] = await Promise.all([
        weaviateClient.deleteByFilter('sourceName', name),
        weaviateClient.deleteByFilterQnA('sourceName', name),
      ]);
      console.log(`[Delete] Removed ${regularDeleted} regular + ${qnaDeleted} QnA chunks from Weaviate`);
    }

    // Delete ALL matching records from MongoDB
    const mongoResult = await db.collection("file").deleteMany({ filename: name });
    console.log(`[Delete] Removed ${mongoResult.deletedCount} MongoDB records`);

    console.log(`[Delete] Completed deletion of source: ${name}`);

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
