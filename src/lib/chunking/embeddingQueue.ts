// Adaptive parallel embedding with backoff, progress callbacks, and no sequential throttle.

import PQueue from "p-queue";
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, MAX_PARALLEL_EMBED_REQ } from "./config";

export type EmbedFn = (text: string) => Promise<number[]>;

export interface QueueItem {
  id: string;
  text: string;
}

export interface EnqueueOptions {
  onProgress?: (done: number, total: number) => void;
  retries?: number; // default 5
}

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

async function backoff(attempt: number) {
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
  await sleep(delay);
}

export async function embedWithQueue(
  items: QueueItem[],
  embed: EmbedFn,
  opts: EnqueueOptions = {}
): Promise<{ id: string; vector: number[] }[]> {
  const out: { id: string; vector: number[] }[] = [];
  const total = items.length;
  let done = 0;
  const retries = opts.retries ?? 5;

  const queue = new PQueue({ concurrency: Math.max(1, MAX_PARALLEL_EMBED_REQ) });

  for (const it of items) {
    queue.add(async () => {
      let attempt = 0;
      while (true) {
        attempt++;
        try {
          const vec = await embed(it.text);
          out.push({ id: it.id, vector: vec });
          done++;
          opts.onProgress?.(done, total);
          return;
        } catch (err: any) {
          if (attempt >= retries) throw err;
          await backoff(attempt);
        }
      }
    });
  }

  await queue.onIdle();
  return out;
}
