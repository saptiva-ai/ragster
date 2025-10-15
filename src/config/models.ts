/**
 * Centralized model configuration for Saptiva API
 * Single source of truth for all model names across the application
 */

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
}

// Available chat models
export const CHAT_MODELS: ModelConfig[] = [
  { id: "Saptiva Turbo", name: "Saptiva Turbo", provider: "saptiva" },
  { id: "Saptiva Cortex", name: "Saptiva Cortex", provider: "saptiva" },
  { id: "Saptiva Ops", name: "Saptiva Ops", provider: "saptiva" },
  { id: "DeepSeek R1 Lite", name: "DeepSeek R1 Lite", provider: "saptiva" },
  { id: "LLAMA3.3 70B", name: "LLAMA3.3 70B", provider: "saptiva" },
];

// Model names as constants
export const MODEL_NAMES = {
  // Chat models
  CHAT_DEFAULT: "Saptiva Turbo",
  CHAT_CORTEX: "Saptiva Cortex",
  CHAT_OPS: "Saptiva Ops",
  DEEPSEEK_R1_LITE: "DeepSeek R1 Lite",
  LLAMA_70B: "LLAMA3.3 70B",

  // Embedding model
  EMBEDDING: "Saptiva Embed",
} as const;

// Default models (with environment variable overrides)
export const DEFAULT_MODELS = {
  CHAT: process.env.DEFAULT_CHAT_MODEL || MODEL_NAMES.CHAT_DEFAULT,
  EMBEDDING: process.env.DEFAULT_EMBEDDING_MODEL || MODEL_NAMES.EMBEDDING,
} as const;

// Default model settings
export const DEFAULT_MODEL_SETTINGS = {
  modelId: DEFAULT_MODELS.CHAT,
  temperature: 0.7,
  systemPrompt:
    "Eres un asistente AI que responde preguntas basándose en los documentos proporcionados. Utiliza solo la información de las fuentes para responder. Si la respuesta no está en los documentos, dilo claramente.",
} as const;
