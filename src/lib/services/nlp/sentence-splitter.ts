/**
 * Sentence splitter service.
 * Splits text into sentences with position tracking.
 */

export interface Sentence {
  text: string;
  start: number;
  end: number;
}

export interface SentenceSplitter {
  split(text: string): Promise<Sentence[]>;
  getName(): string;
}

/**
 * Sentence splitter using compromise NLP library.
 */
export class CompromiseSentenceSplitter implements SentenceSplitter {
  async split(text: string): Promise<Sentence[]> {
    try {
      // Normalize text: replace \r\n with \n, clean up whitespace
      const normalizedText = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n');

      // Dynamic import with fallback
      const compromiseModule = await import('compromise');
      const nlp = compromiseModule.default || compromiseModule;

      if (typeof nlp !== 'function') {
        console.warn('[SentenceSplitter] compromise not available, using fallback');
        return this.fallbackSplit(normalizedText);
      }

      const doc = nlp(normalizedText);
      const sentences: Sentence[] = [];
      let currentPos = 0;

      // Get all sentences from the document
      const sentenceList = doc.sentences().out('array') as string[];

      for (const sentenceText of sentenceList) {
        const trimmed = sentenceText.trim();
        if (!trimmed) continue;

        // Find position in original text
        const start = normalizedText.indexOf(trimmed, currentPos);
        if (start === -1) continue;

        const end = start + trimmed.length;

        sentences.push({
          text: trimmed,
          start,
          end,
        });

        currentPos = end;
      }

      return sentences;
    } catch (error) {
      console.error('[SentenceSplitter] Error with compromise, using fallback:', error);
      return this.fallbackSplit(text);
    }
  }

  /**
   * Fallback sentence splitter using regex.
   * Used when compromise library fails.
   */
  private fallbackSplit(text: string): Sentence[] {
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split on sentence-ending punctuation followed by space or newline
    const sentenceRegex = /[^.!?]*[.!?]+(?:\s|$)|[^.!?\n]+(?:\n|$)/g;
    const matches = normalizedText.match(sentenceRegex) || [];

    const sentences: Sentence[] = [];
    let currentPos = 0;

    for (const match of matches) {
      const trimmed = match.trim();
      if (!trimmed) continue;

      const start = normalizedText.indexOf(trimmed, currentPos);
      if (start === -1) continue;

      const end = start + trimmed.length;

      sentences.push({
        text: trimmed,
        start,
        end,
      });

      currentPos = end;
    }

    return sentences;
  }

  getName(): string {
    return 'CompromiseSentenceSplitter';
  }
}

// Singleton instance
let splitterInstance: CompromiseSentenceSplitter | null = null;

export function getSentenceSplitter(): SentenceSplitter {
  if (!splitterInstance) {
    splitterInstance = new CompromiseSentenceSplitter();
  }
  return splitterInstance;
}
