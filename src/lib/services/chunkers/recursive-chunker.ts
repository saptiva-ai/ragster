import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { TextChunker } from '@/lib/core/interfaces';
import { Chunk, ChunkOptions, ChunkStructure } from '@/lib/core/types';

/**
 * Recursive character text chunker with STRUCTURE DETECTION.
 * Uses LangChain's RecursiveCharacterTextSplitter for intelligent text splitting.
 *
 * v2.0: Now emits language-agnostic structural metadata for each chunk.
 * This enables structure-aware filtering and evidence classification.
 *
 * Use for: OCR PDFs, images, unreliable text sources
 * Rationale: OCR output often lacks reliable sentence delimiters. Size-based chunking ensures consistent context windows.
 */

// STRUCTURE DETECTION (Language-Agnostic)

/**
 * Detect structural signals from text layout patterns.
 * Works for ANY language - based on formatting, not words.
 */
function detectStructure(text: string): ChunkStructure {
  const lines = text.split('\n');

  // ---- HEADING DETECTION ----
  // Patterns are LANGUAGE-AGNOSTIC - based on formatting, not keywords
  // Detects: markdown headers, numbered sections, ALL CAPS, roman numerals
  const headingPatterns = [
    /^#{1,6}\s+\S/,                           // Markdown: ## Heading
    /^(?:\d+\.)+\s*[A-ZÁÉÍÓÚÑ]/,              // Numbered: 1.2.3 Section
    /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{10,}$/,        // ALL CAPS (min 10 chars)
    /^[IVXLCDM]+\.\s+\S/,                     // Roman numerals: IV. Section
    // NOTE: Removed domain-specific keywords (Artículo, Chapter, etc.) to stay doc-agnostic
  ];

  let hasHeading = false;
  let headingDepth = 0;

  // Check first 3 lines for heading
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    for (const pattern of headingPatterns) {
      if (pattern.test(line)) {
        hasHeading = true;
        // Estimate depth from pattern
        if (/^#{1}[^#]/.test(line)) headingDepth = 1;
        else if (/^#{2}[^#]/.test(line)) headingDepth = 2;
        else if (/^#{3,}/.test(line)) headingDepth = 3;
        else if (/^\d+\.\d+\.\d+/.test(line)) headingDepth = 3;
        else if (/^\d+\.\d+/.test(line)) headingDepth = 2;
        else if (/^\d+\./.test(line)) headingDepth = 1;
        else headingDepth = 1;
        break;
      }
    }
    if (hasHeading) break;
  }

  // ---- LIST DETECTION ----
  // Patterns: "• item", "- item", "* item", "1. item", "a) item", "i) item"
  const listPatterns = [
    /^[\s]*[•●○◦▪▸►]\s+\S/,                   // Bullets
    /^[\s]*[-–—]\s+\S/,                        // Dashes
    /^[\s]*\*\s+\S/,                           // Asterisks
    /^[\s]*\d+[.)]\s+\S/,                      // Numbered: 1. or 1)
    /^[\s]*[a-zA-Z][.)]\s+\S/,                 // Lettered: a) or a.
    /^[\s]*[ivxIVX]+[.)]\s+\S/,                // Roman: i) or iv.
  ];

  let listItemCount = 0;
  for (const line of lines) {
    for (const pattern of listPatterns) {
      if (pattern.test(line)) {
        listItemCount++;
        break;
      }
    }
  }
  const isList = listItemCount >= 2;

  // ---- ENUMERATION DETECTION ----
  // Specifically numbered/sequential items (stricter than list)
  const enumeratedMatches = text.match(/(?:^|\n)[\s]*(?:\d+[.)]|\([a-z]\)|[a-z]\))\s+\S/gm);
  const isEnumerated = (enumeratedMatches?.length || 0) >= 2;

  // ---- DEFINITION BLOCK DETECTION ----
  // Patterns: "Term: definition", "Term - definition", "Term. Definition"
  const definitionPatterns = [
    /^[\s]*[A-ZÁÉÍÓÚÑ][^:.\n]{2,30}:\s+\S/m,   // "Term: definition"
    /^[\s]*[A-ZÁÉÍÓÚÑ][^-\n]{2,30}\s+-\s+\S/m, // "Term - definition"
  ];
  const isDefinitionBlock = definitionPatterns.some(p => p.test(text));

  // ---- TABLE DETECTION ----
  // Patterns: pipes "|", aligned whitespace columns, tab-separated
  const hasTablePipes = (text.match(/\|/g)?.length || 0) >= 3;
  const hasTabSeparation = lines.filter(l => (l.match(/\t/g)?.length || 0) >= 2).length >= 2;
  const hasAlignedColumns = detectAlignedColumns(lines);
  const isTable = hasTablePipes || hasTabSeparation || hasAlignedColumns;

  // ---- INDENTATION DETECTION ----
  // Check for consistent indentation patterns
  const indentedLines = lines.filter(l => /^[\s]{2,}\S/.test(l)).length;
  const hasIndentation = indentedLines >= 3 && indentedLines / lines.length > 0.2;

  // ---- STRUCTURAL DENSITY ----
  // Score 0-1 based on how much structure is present
  let structuralMarkers = 0;
  if (hasHeading) structuralMarkers += 2;
  if (isList) structuralMarkers += listItemCount;
  if (isEnumerated) structuralMarkers += 2;
  if (isDefinitionBlock) structuralMarkers += 1;
  if (isTable) structuralMarkers += 3;
  if (hasIndentation) structuralMarkers += 1;

  const structuralDensity = Math.min(1, structuralMarkers / 10);

  return {
    hasHeading,
    headingDepth,
    isList,
    listItemCount,
    isDefinitionBlock,
    isTable,
    isEnumerated,
    hasIndentation,
    structuralDensity,
  };
}

/**
 * Detect aligned columns (for table-like structures without pipes).
 * Looks for consistent spacing patterns across lines.
 */
function detectAlignedColumns(lines: string[]): boolean {
  if (lines.length < 3) return false;

  // Find lines with multiple whitespace gaps
  const gapPositions: number[][] = [];

  for (const line of lines.slice(0, 10)) {  // Check first 10 lines
    const gaps: number[] = [];
    let inGap = false;
    let gapStart = 0;

    for (let i = 0; i < line.length; i++) {
      if (line[i] === ' ' && !inGap && i > 0 && line[i-1] !== ' ') {
        inGap = true;
        gapStart = i;
      } else if (line[i] !== ' ' && inGap) {
        if (i - gapStart >= 2) {  // Gap of at least 2 spaces
          gaps.push(gapStart);
        }
        inGap = false;
      }
    }

    if (gaps.length >= 2) {
      gapPositions.push(gaps);
    }
  }

  // Check if at least 3 lines have similar gap positions
  if (gapPositions.length < 3) return false;

  // Simple check: first gap position should be similar
  const firstGaps = gapPositions.map(g => g[0]);
  const avgFirstGap = firstGaps.reduce((a, b) => a + b, 0) / firstGaps.length;
  const alignedCount = firstGaps.filter(g => Math.abs(g - avgFirstGap) <= 3).length;

  return alignedCount >= 3;
}

export class RecursiveChunker implements TextChunker {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(chunkSize = 1000, chunkOverlap = 150) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  async chunk(text: string, options?: ChunkOptions): Promise<Chunk[]> {
    const chunkSize = options?.chunkSize || this.chunkSize;
    const chunkOverlap = options?.chunkOverlap || this.chunkOverlap;
    const separators = options?.separators || ['\n\n', '\n', '. ', ', ', ' ', ''];

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators,
    });

    const splitTexts = await splitter.splitText(text.trim());

    // Track position for startPosition/endPosition
    let position = 0;

    return splitTexts.map((content, index) => {
      // Calculate content without overlap (for sequential chunk optimization)
      const overlapChars = index > 0 ? Math.min(chunkOverlap, content.length) : 0;
      const contentWithoutOverlap = content.slice(overlapChars);

      // DETECT STRUCTURE (language-agnostic)
      const structure = detectStructure(content);

      const chunk: Chunk = {
        id: `chunk-${index + 1}`,
        content,
        contentWithoutOverlap: contentWithoutOverlap || content,
        index: index + 1,
        startPosition: position,
        endPosition: position + content.length,
        structure,  // NEW: structural metadata
      };

      // Move position forward (accounting for overlap)
      // Guard against negative drift if chunk is shorter than overlap
      position += Math.max(0, content.length - chunkOverlap);

      return chunk;
    });
  }

  getDefaultChunkSize(): number {
    return this.chunkSize;
  }

  getDefaultOverlap(): number {
    return this.chunkOverlap;
  }

  getName(): string {
    return 'RecursiveChunker';
  }
}

/**
 * Create a RecursiveChunker with OCR-optimized defaults.
 */
export function createRecursiveChunker(
  chunkSize = 1000,
  chunkOverlap = 150
): RecursiveChunker {
  return new RecursiveChunker(chunkSize, chunkOverlap);
}
