/**
 * TEXT NORMALIZATION UTILITIES
 *
 * Consolidated from: route.ts, chunk-filter.ts, evidence-checker.ts
 * Single source of truth for all text normalization in the RAG pipeline.
 */

/**
 * Accent-insensitive normalization (most common use case).
 * Removes accents, lowercases, collapses whitespace.
 * Used for: response classification, question classification, evidence matching.
 *
 * @example normalizeAccentInsensitive("¿Qué pasó?") => "que paso"
 */
export function normalizeAccentInsensitive(text: string): string {
  return (text ?? "")
    .replace(/(\p{L})-\s*\r?\n\s*(\p{L})/gu, "$1$2") // Join hyphenated line breaks
    .replace(/\r?\n+/g, " ")                          // Remove newlines
    .replace(/[""«»]/g, '"')                          // Normalize curly quotes
    .replace(/['']/g, "'")                            // Normalize curly apostrophes
    .normalize("NFKD")                                // Decompose for accent removal
    .replace(/\p{Diacritic}/gu, "")                   // Remove accents (á → a)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")                 // Remove all punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strict normalization: keeps accents intact, only normalizes typography.
 * Uses Unicode property escapes - zero hardcoded character lists.
 * Used for: "cita literal exacta" validation where accents matter.
 *
 * @example normalizeStrict(""Según el artículo"") => '"Según el artículo"'
 */
export function normalizeStrict(text: string): string {
  return (text ?? "")
    .normalize("NFKC")                               // Normalize ligatures, width variants
    .replace(/\p{Cf}/gu, "")                         // Remove format chars (zero-width, BOM)
    .replace(/(\p{L})-\s*\r?\n\s*(\p{L})/gu, "$1$2") // Join hyphenated line breaks
    .replace(/[\p{Pi}\p{Pf}]/gu, '"')                // Normalize directional quotes
    .replace(/\p{Pd}/gu, "-")                        // All dash punctuation → hyphen
    .replace(/\p{Z}+/gu, " ")                        // All separators → space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Loose normalization that protects decimal numbers.
 * Goal: tolerate punctuation/spacing noise from PDFs without turning 3.2 -> 32.
 * Used for: citation quote matching where numbers matter.
 *
 * @example normalizeLooseDecimalSafe("Artículo 3.2, inciso a)") => "articulo 3.2 inciso a"
 */
export function normalizeLooseDecimalSafe(text: string): string {
  return (text ?? "")
    // Join hyphenated words across line breaks
    .replace(/(\p{L})-\s*\r?\n\s*(\p{L})/gu, "$1$2")
    .replace(/\r?\n+/g, " ")

    // Normalize common typography
    .replace(/[""«»]/g, '"')
    .replace(/['']/g, "'")

    // Protect decimals and digit-grouping before stripping punctuation
    .replace(/(\d)\.(\d)/g, "$1§DOT§$2")
    .replace(/(\d),(\d)/g, "$1§COMMA§$2")

    // Accent-insensitive match
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")

    .toLowerCase()

    // Strip most punctuation to spaces, but keep our § tokens and letters/numbers
    .replace(/[^\p{L}\p{N}§]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()

    // Restore protected tokens
    .replace(/§DOT§/g, ".")
    .replace(/§COMMA§/g, ",");
}

// ================================
// ALIASES for backward compatibility
// ================================

/** @alias normalizeAccentInsensitive - used in evidence-checker.ts */
export const normalize = normalizeAccentInsensitive;

/** @alias normalizeAccentInsensitive - used in chunk-filter.ts */
export const normalizeForMatch = normalizeAccentInsensitive;

/** @alias normalizeAccentInsensitive - used in route.ts for response classification */
export const normForDetect = normalizeAccentInsensitive;
