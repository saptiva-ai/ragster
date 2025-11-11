import type { DocType } from "./config";

// Heuristics to label a chunk with a section title.
// For Markdown we use headers; for PDF/DOCX simple title-like lines.

export function extractSectionTitle(
  text: string,
  docType: DocType
): string | undefined {
  const lines = text.split(/\r?\n/);

  if (docType === "md") {
    // Prefer the first visible header in the chunk
    for (const line of lines) {
      const m = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
      if (m) return sanitize(m[1]);
    }
  }

  // Generic "title-like" detection: short, capitalized, no trailing punctuation
  for (const line of lines) {
    const t = line.trim();
    if (
      t.length >= 4 &&
      t.length <= 80 &&
      /^[A-ZÁÉÍÓÚÑ][\w\s\-\(\)]+$/.test(t) &&
      !/[.:;]$/.test(t)
    ) {
      return sanitize(t);
    }
  }
  return undefined;
}

function sanitize(s: string) {
  return s.replace(/\s+/g, " ").trim();
}
