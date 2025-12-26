export interface TestCase {
  id: string;
  query: string;
  expected: {
    // Para evaluar Recuperación (Retrieval)
    sourceMatches?: string[]; // Nombres de archivo o 'sourceName' que DEBEN aparecer
    keywordsInChunks?: string[]; // Palabras que deben estar en los chunks recuperados
    
    // Para evaluar Generación (Generation)
    answerContains?: string[]; // Frases clave que deben estar en la respuesta final
    shouldRefuse?: boolean; // Si true, esperamos que el modelo diga "No se encuentra información"
  };
  tags?: string[]; // ej: "factoid", "reasoning", "negative"
}

export interface BenchmarkResult {
  testId: string;
  query: string;
  retrieval: {
    foundSources: string[];
    hitRate: boolean; // ¿Encontró al menos 1 fuente esperada?
    mrr: number; // Mean Reciprocal Rank (posición del primer resultado relevante)
    totalChunks: number;
  };
  generation?: {
    answer: string;
    passedContains: boolean;
    passedRefusal: boolean;
  };
  success: boolean;
  latencyMs: number;
}
