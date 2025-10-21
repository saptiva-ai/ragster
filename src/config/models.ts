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
  { id: "Saptiva Legacy", name: "Saptiva Legacy", provider: "saptiva" },
  { id: "Saptiva Ops", name: "Saptiva Ops", provider: "saptiva" },
  { id: "Saptiva Cortex", name: "Saptiva Cortex", provider: "saptiva" },
];

// Model names as constants
export const MODEL_NAMES = {
  // Chat models
  CHAT_DEFAULT: "Saptiva Turbo",
  CHAT_LEGACY: "Saptiva Legacy",
  CHAT_OPS: "Saptiva Ops",
  CHAT_CORTEX: "Saptiva Cortex",

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
