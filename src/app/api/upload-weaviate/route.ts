import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { weaviateClient } from "@/lib/services/weaviate-client";
import { getDocumentProcessor } from "@/lib/services/document-processor";
import { uploadQueue } from "@/lib/services/queue";

// Force dynamic rendering
export const dynamic = "force-dynamic";

/**
 * POST /api/upload-weaviate
 * Upload and process documents into Weaviate vector store.
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
    const testMode = req.nextUrl.searchParams.get("test") === "true";
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

    // 4. Process each file
    const { db } = await connectToDatabase();
    const fileCollection = db.collection("file");
    const processor = getDocumentProcessor();
    const processedFiles = [];

    for (const file of files) {
      // Create file record in MongoDB
      const fileRecord = await fileCollection.insertOne({
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

      // Check if OCR mode is requested for PDF files
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf && useOcr) {
        // Queue for background OCR processing
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const jobId = uploadQueue.add({
          fileBuffer,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          userId,
          namespace: formNamespace,
        });

        console.log(`[Upload] Queued OCR job ${jobId} for ${file.name}`);

        processedFiles.push({
          filename: file.name,
          size: file.size,
          type: file.type,
          queued: true,
          jobId,
          message: 'Processing in background with OCR',
        });
        continue; // Skip to next file
      }

      try {
        // Process document (extract → detect language → chunk by sentences → embed)
        const result = await processor.process(
          file,
          { userId, namespace: formNamespace },
          {
            chunkerType: 'sentence',
            sentencesPerChunk: 5,
            overlapSentences: 1
          }
        );

        console.log(`[Upload] ${file.name}: ${result.stats.totalChunks} chunks in ${result.stats.processingTimeMs}ms`);

        // Test mode: skip Weaviate insertion
        if (testMode) {
          processedFiles.push({
            filename: file.name,
            size: file.size,
            type: file.type,
            chunks: result.stats.totalChunks,
          });
          continue;
        }

        // Build Weaviate objects for batch insert
        const objects = result.chunks.map((chunk, index) => ({
          properties: {
            text: chunk.content,
            chunkIndex: index + 1,
            totalChunks: result.stats.totalChunks,
            prevChunkIndex: index > 0 ? index : null,
            nextChunkIndex: index < result.stats.totalChunks - 1 ? index + 2 : null,
            sourceName: file.name,
            sourceType: file.type,
            sourceSize: file.size.toString(),
            uploadDate: result.metadata.uploadDate,
            sourceNamespace: formNamespace,
            userId: userId,
            // New fields from sentence chunker
            language: result.stats.detectedLanguage,
            startPosition: chunk.startPosition ?? 0,
            endPosition: chunk.endPosition ?? chunk.content.length,
            contentWithoutOverlap: chunk.contentWithoutOverlap ?? chunk.content,
            chunkerUsed: result.stats.chunkerUsed,
          },
          vector: chunk.embedding,
        }));

        // Insert batch into Weaviate (v2 API)
        await weaviateClient.insertBatch(objects);
        console.log(`[Upload] Inserted ${objects.length} chunks into Weaviate`);

        // Update MongoDB status with language info
        await fileCollection.updateOne(
          { _id: fileRecord.insertedId },
          {
            $set: {
              chunks: result.stats.totalChunks,
              vectorsUploaded: result.stats.totalChunks,
              status: 2, // completed
              language: result.stats.detectedLanguage,
              chunkerUsed: result.stats.chunkerUsed,
            }
          }
        );

        processedFiles.push({
          filename: file.name,
          size: file.size,
          type: file.type,
          chunks: result.stats.totalChunks,
          vectorsUploaded: result.stats.totalChunks,
          namespace: formNamespace,
          processingTimeMs: result.stats.processingTimeMs,
          language: result.stats.detectedLanguage,
          chunkerUsed: result.stats.chunkerUsed,
        });

      } catch (error) {
        console.error(`[Upload] Error processing ${file.name}:`, error);

        // Update MongoDB with error status
        await fileCollection.updateOne(
          { _id: fileRecord.insertedId },
          { $set: { status: -1, error: error instanceof Error ? error.message : "Unknown error" } }
        );

        processedFiles.push({
          filename: file.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `${files.length} files processed`,
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
