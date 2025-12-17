/**
 * Structural metadata for a chunk.
 * Language-agnostic signals derived from layout patterns.
 * Works for any PDF/DOC/Markdown regardless of language.
 */
export interface ChunkStructure {
  /** Chunk starts with a heading pattern (##, numbered section, ALL CAPS line) */
  hasHeading: boolean;
  /** Heading depth (1=H1, 2=H2, etc.) - 0 if no heading */
  headingDepth: number;
  /** Contains list items (bullets, numbered, lettered) */
  isList: boolean;
  /** Number of list items detected */
  listItemCount: number;
  /** Contains definition pattern ("X: definition" or "X - definition") */
  isDefinitionBlock: boolean;
  /** Contains table-like structure (aligned columns, pipes) */
  isTable: boolean;
  /** Contains enumerated/numbered items (1., 2., 3. or a), b), c)) */
  isEnumerated: boolean;
  /** Has significant indentation structure */
  hasIndentation: boolean;
  /** Density of structural markers (0-1 scale) */
  structuralDensity: number;
}

export interface Chunk {
  id: string;
  content: string;
  contentWithoutOverlap?: string;
  index: number;
  startPosition?: number;
  endPosition?: number;
  metadata?: Record<string, unknown>;
  /** Language-agnostic structural signals */
  structure?: ChunkStructure;
}

export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}
