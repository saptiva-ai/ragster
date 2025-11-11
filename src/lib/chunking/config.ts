// Centralized, no-BC config for chunk sizes & overlaps.
// Override with env if desired.

export type DocType = "pdf" | "docx" | "md" | "txt";

export const DEFAULTS = {
  CHUNK_SIZE_TOKENS: 400,
  CHUNK_OVERLAP_TOKENS: 60,
  MIN_CHUNK_TOKENS: 40,
} as const;

export const CHUNK_SIZES: Record<DocType, number> = {
  md:   Number(process.env.CHUNK_SIZE_TOKENS_MD   ?? 450),
  pdf:  Number(process.env.CHUNK_SIZE_TOKENS_PDF  ?? 300),
  docx: Number(process.env.CHUNK_SIZE_TOKENS_DOCX ?? 350),
  txt:  Number(process.env.CHUNK_SIZE_TOKENS_TXT  ?? 400),
};

export const OVERLAPS: Record<DocType, number> = {
  md:   Number(process.env.CHUNK_OVERLAP_TOKENS_MD   ?? 60),
  pdf:  Number(process.env.CHUNK_OVERLAP_TOKENS_PDF  ?? 40),
  docx: Number(process.env.CHUNK_OVERLAP_TOKENS_DOCX ?? 50),
  txt:  Number(process.env.CHUNK_OVERLAP_TOKENS_TXT  ?? 60),
};

export const MIN_TOKENS = Number(process.env.MIN_CHUNK_TOKENS ?? DEFAULTS.MIN_CHUNK_TOKENS);

export const MAX_PARALLEL_EMBED_REQ = Number(process.env.EMBED_MAX_PARALLEL ?? 5);
export const BACKOFF_BASE_MS = Number(process.env.EMBED_BACKOFF_BASE_MS ?? 600);
export const BACKOFF_MAX_MS  = Number(process.env.EMBED_BACKOFF_MAX_MS  ?? 6000);
