import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { weaviateClient } from "@/lib/services/weaviate-client";
import { uploadQueue } from "@/lib/services/queue";

// Force dynamic rendering
export const dynamic = "force-dynamic";

/**
 * POST /api/upload-weaviate
 * Upload and process documents into Weaviate vector store.
 * ALL documents are processed through the background queue for progress tracking.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Parse request
    const namespace = req.nextUrl.searchParams.get("namespace") || "default";
    const formData = await req.formData();

    let files = formData.getAll("file") as File[];
    if (!files || files.length === 0) {
      files = formData.getAll("files") as File[];
    }

    const formNamespace = (formData.get("namespace") as string) || namespace;
    const useOcr = formData.get("useOcr") === "true";

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    // 3. Ensure shared collection exists in Weaviate
    const collectionName = await weaviateClient.ensureCollectionExists();
    console.log(`[Upload] Collection ${collectionName} ready`);

    // 4. Queue ALL files for background processing (provides progress tracking)
    const { db } = await connectToDatabase();
    const fileCollection = db.collection("file");
    const processedFiles = [];

    for (const file of files) {
      // Delete existing MongoDB record with same filename (replace behavior)
      // This ensures no duplicate entries when re-uploading the same document
      const deleteResult = await fileCollection.deleteMany({
        filename: file.name,
        userId: userId,
      });
      if (deleteResult.deletedCount > 0) {
        console.log(`[Upload] Replacing existing document "${file.name}" (${deleteResult.deletedCount} old record(s) deleted)`);
      }

      // Create file record in MongoDB with status=1 (processing)
      await fileCollection.insertOne({
        filename: file.name,
        size: file.size,
        type: file.type,
        chunks: null,
        vectorsUploaded: null,
        namespace: formNamespace,
        uploadDate: new Date(),
        status: 1, // processing
        userId: userId,
      });

      // Queue for background processing (all documents go through queue now)
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const jobId = uploadQueue.add({
        fileBuffer,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        userId,
        namespace: formNamespace,
        useOcr, // Pass OCR preference to queue
      });

      console.log(`[Upload] Queued job ${jobId} for ${file.name} (OCR: ${useOcr})`);

      processedFiles.push({
        filename: file.name,
        size: file.size,
        type: file.type,
        queued: true,
        jobId,
        message: useOcr ? 'Processing with OCR' : 'Processing document',
      });
    }

    return NextResponse.json({
      success: true,
      message: `${files.length} file(s) queued for processing`,
      processedFiles,
    });

  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}
