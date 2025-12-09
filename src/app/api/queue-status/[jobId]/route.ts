import { NextRequest, NextResponse } from 'next/server';
import { uploadQueue } from '@/lib/services/queue';

/**
 * GET /api/queue-status/[jobId]
 * Get the status of a queued upload job.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const job = uploadQueue.getStatus(jobId);

  if (!job) {
    return NextResponse.json(
      { error: 'Job not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    error: job.error,
    result: job.result,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    // OCR progress info
    ocrPage: job.ocrPage,
    ocrTotalPages: job.ocrTotalPages,
  });
}
