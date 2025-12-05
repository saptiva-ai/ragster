/**
 * Language detection service.
 * Detects the language of a given text using franc.
 */

import { franc } from 'franc';

export interface LanguageResult {
  language: string;      // "en", "es", "fra", etc. (ISO 639-3)
  confidence: number;    // 0-1 (franc doesn't provide this, so we estimate)
}

export interface LanguageDetector {
  detect(text: string): Promise<LanguageResult>;
  getName(): string;
}

// Map ISO 639-3 to ISO 639-1 (common short codes)
const langMap: Record<string, string> = {
  eng: 'en',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  ita: 'it',
  por: 'pt',
  nld: 'nl',
  rus: 'ru',
  zho: 'zh',
  jpn: 'ja',
  kor: 'ko',
  ara: 'ar',
  hin: 'hi',
  und: 'es', // undefined defaults to Spanish
};

/**
 * Simple language detector using franc.
 */
export class SimpleLanguageDetector implements LanguageDetector {
  async detect(text: string): Promise<LanguageResult> {
    // Sample first 1000 chars for speed
    const sample = text.slice(0, 1000);

    try {
      const detected = franc(sample);
      // Always default to 'es' (Spanish) for unknown language codes (e.g., 'afr', 'swe')
      // Only use mapped languages to ensure system compatibility
      const language = langMap[detected] || 'es';

      // Estimate confidence based on text length
      const confidence = sample.length > 100 ? 0.8 : 0.5;

      return { language, confidence };
    } catch (error) {
      console.warn('[LanguageDetector] Detection failed, defaulting to Spanish:', error);
      return { language: 'es', confidence: 0 };
    }
  }

  getName(): string {
    return 'SimpleLanguageDetector';
  }
}

// Singleton instance
let detectorInstance: SimpleLanguageDetector | null = null;

export function getLanguageDetector(): LanguageDetector {
  if (!detectorInstance) {
    detectorInstance = new SimpleLanguageDetector();
  }
  return detectorInstance;
}
