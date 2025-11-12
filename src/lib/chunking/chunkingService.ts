/**
 * Unified Chunking Service - Phase 1 Clean Implementation
 *
 * Features:
 * - Adaptive chunk sizing per document type (PDF: 300, DOCX: 350, MD: 450, TXT: 400 tokens)
 * - Two-pass strategy: structure-aware segmentation → token-based packing
 * - Deterministic content-hash IDs
 * - Section title extraction
 * - PDF page anchoring support
 * - Deduplication
 * - No legacy/deprecated code
 */

import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { AutoTokenizer, PreTrainedTokenizer } from "@xenova/transformers";
import crypto from "crypto";

import { CHUNK_SIZES, OVERLAPS, MIN_TOKENS, DEFAULTS, type DocType } from "./config";
import { mapChunkToPage, type PageSpan } from "./pageMapper";
import { extractSectionTitle } from "./sectionExtractor";

export { type DocType } from "./config";
export type { PageSpan } from "./pageMapper";

export interface ChunkingOptions {
  namespace: string;
  sourceId: string;     // stable per document
  docType: DocType;     // "pdf" | "docx" | "md" | "txt"
  pageSpans?: PageSpan[]; // optional, for PDFs with offsets
}

let tokenizerPromise: Promise<PreTrainedTokenizer> | null = null;

async function getTokenizer() {
  if (!tokenizerPromise) {
    // Using E5 tokenizer for token counting (compatible with Qwen3 token semantics)
    tokenizerPromise = AutoTokenizer.from_pretrained("intfloat/multilingual-e5-large");
  }
  return tokenizerPromise;
}

function sha256Short(s: string, bytes = 12) {
  const h = crypto.createHash("sha256").update(s, "utf8").digest("hex");
  return h.slice(0, bytes * 2);
}

function normalizeForHash(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Pass 1: Structure-aware segmentation
 * Creates semantic boundaries without breaking structure
 */
function makeSplitterFor(docType: DocType) {
  const mdSeparators = [
    "\n```",        // Code blocks
    "\n###### ",    // H6
    "\n##### ",     // H5
    "\n#### ",      // H4
    "\n### ",       // H3
    "\n## ",        // H2
    "\n# ",         // H1
    "\n\n",         // Paragraphs
    "\n",           // Lines
    "。",           // Chinese period
    ". ",           // English period
    " ",            // Words
    ""              // Characters (last resort)
  ];
  const genericSeparators = ["\n\n", "\n", "。", ". ", " ", ""];
  const separators = docType === "md" ? mdSeparators : genericSeparators;

  return new RecursiveCharacterTextSplitter({
    chunkSize: 2000,   // Large to avoid premature cuts in pass 1
    chunkOverlap: 0,   // No overlap in structural segmentation
    separators,
  });
}

/**
 * Pass 2: Token-based packing with adaptive sizing
 * Packs structural segments into exact token-sized chunks
 */
async function packIntoTokenWindows(
  segments: string[],
  docType: DocType
) {
  const chunkSizeTokens = CHUNK_SIZES[docType] ?? DEFAULTS.CHUNK_SIZE_TOKENS;
  const overlapTokens   = OVERLAPS[docType]    ?? DEFAULTS.CHUNK_OVERLAP_TOKENS;
  const minTokens       = MIN_TOKENS;

  const tok = await getTokenizer();
  const chunks: { text: string; tokenIds: number[]; startOffset: number }[] = [];

  const encode = async (t: string) =>
    (await tok(t, { add_special_tokens: false })).input_ids as number[];
  const decode = (ids: number[]) => tok.decode(ids, { skip_special_tokens: true }) as string;

  let curIds: number[] = [];
  let curTexts: string[] = [];

  // Track character offsets for page mapping
  let charCursor = 0;
  const segOffsets: number[] = [];
  for (const s of segments) {
    segOffsets.push(charCursor);
    charCursor += s.length + 1; // +1 for newline between segments
  }

  let chunkStartOffset = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segIds = await encode(seg);

    if (curIds.length + segIds.length <= chunkSizeTokens) {
      curIds = curIds.concat(segIds);
      curTexts.push(seg);
      if (curTexts.length === 1) chunkStartOffset = segOffsets[i]; // Mark start of new chunk
      continue;
    }

    // Flush current chunk if it has enough content
    if (curIds.length >= minTokens) {
      chunks.push({
        text: curTexts.join("\n"),
        tokenIds: curIds,
        startOffset: chunkStartOffset
      });
    } else {
      console.log(`Skipping chunk with ${curIds.length} tokens (min required: ${minTokens})`);
    }

    // Start new chunk with overlap
    const overlap = curIds.slice(-overlapTokens);
    const overlapText = overlap.length ? decode(overlap) : "";
    curIds = overlap.concat(segIds);
    curTexts = overlapText ? [overlapText, seg] : [seg];
    chunkStartOffset = Math.max(0, segOffsets[i] - overlapText.length);

    // Handle very large segments (split by tokens)
    while (curIds.length > chunkSizeTokens) {
      const head = curIds.slice(0, chunkSizeTokens);
      const headText = decode(head);
      if (head.length >= minTokens) {
        chunks.push({
          text: headText,
          tokenIds: head,
          startOffset: chunkStartOffset
        });
      }

      const tail = curIds.slice(chunkSizeTokens - overlapTokens);
      curIds = tail;
      curTexts = [decode(tail)];
      chunkStartOffset += headText.length;
    }
  }

  // Final chunk
  if (curIds.length >= minTokens) {
    chunks.push({
      text: curTexts.join("\n"),
      tokenIds: curIds,
      startOffset: chunkStartOffset
    });
  } else if (curIds.length > 0) {
    console.log(`Skipping final chunk with ${curIds.length} tokens (min required: ${minTokens})`);
  }

  // Drop exact duplicates by hash
  const seen = new Set<string>();
  const deduped = chunks.filter(({ text }) => {
    const key = sha256Short(normalizeForHash(text), 8);
    if (seen.has(key)) {
      console.log(`Filtered duplicate chunk with hash: ${key}`);
      return false;
    }
    seen.add(key);
    return true;
  });

  console.log(`packIntoTokenWindows: ${chunks.length} chunks before dedup, ${deduped.length} after dedup`);
  return deduped;
}

/**
 * Main chunking function
 *
 * @param content - Document text content
 * @param options - Chunking options including namespace, sourceId, docType, and optional pageSpans
 * @returns Array of LangChain Documents with rich metadata
 */
export async function chunkDocument(
  content: string,
  { namespace, sourceId, docType, pageSpans }: ChunkingOptions
): Promise<Document[]> {
  if (!content || content.trim().length === 0) {
    console.warn("chunkDocument: empty content provided");
    return [];
  }

  console.log(
    `Chunking: sourceId=${sourceId}, docType=${docType}, ` +
    `target=${CHUNK_SIZES[docType]} tokens, overlap=${OVERLAPS[docType]} tokens`
  );

  // Pass 1: Structure-aware segmentation
  const splitter = makeSplitterFor(docType);
  const segDocs = await splitter.createDocuments([content]);
  const segments = segDocs.map(d => d.pageContent);

  console.log(`Pass 1: ${segments.length} structural segments`);

  // Pass 2: Token-based packing with adaptive sizing
  const packed = await packIntoTokenWindows(segments, docType);

  console.log(`Pass 2: ${packed.length} token-based chunks (after deduplication)`);

  if (packed.length === 0) {
    console.warn(`WARNING: 0 chunks created! Content length: ${content.length}, Segments: ${segments.length}`);
    console.warn(`First 500 chars of content: "${content.substring(0, 500)}"`);
    console.warn(`MIN_TOKENS requirement: ${MIN_TOKENS}`);
  }

  // Build final documents with rich metadata
  const out: Document[] = [];
  for (let i = 0; i < packed.length; i++) {
    const chunk = packed[i];
    const text = chunk.text;

    // Generate deterministic ID
    const norm = normalizeForHash(text);
    const contentHash = sha256Short(norm, 12);
    const id = `${namespace}:${sourceId}:${String(i + 1).padStart(6, "0")}:${contentHash}`;

    // Extract section title (heuristic)
    const sectionTitle = extractSectionTitle(text, docType);

    // Map to page number if spans provided
    let pageNumber: number | undefined = undefined;
    if (pageSpans && pageSpans.length) {
      const endOffset = chunk.startOffset + text.length;
      pageNumber = mapChunkToPage(chunk.startOffset, endOffset, pageSpans);
    }

    out.push(new Document({
      pageContent: text,
      metadata: {
        sourceId,
        namespace,
        chunkIndex: i + 1,
        totalChunks: packed.length,
        chunkId: id,
        docType,
        sectionTitle,
        pageNumber,
        chunkSizeTokens: chunk.tokenIds.length,
        contentHash,
        timestamp: new Date().toISOString(),
      }
    }));
  }

  console.log(`Chunking complete: ${out.length} chunks created for ${sourceId}`);
  return out;
}

/**
 * Get current chunk configuration (useful for logging/debugging)
 */
export function getChunkConfig(docType?: DocType) {
  if (docType) {
    return {
      chunkSizeTokens: CHUNK_SIZES[docType],
      overlapTokens: OVERLAPS[docType],
      minTokens: MIN_TOKENS,
    };
  }
  return {
    defaults: DEFAULTS,
    sizes: CHUNK_SIZES,
    overlaps: OVERLAPS,
    minTokens: MIN_TOKENS,
  };
}
