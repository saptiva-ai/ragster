import { SaptivaService } from "./saptiva";

export type ModelProvider = "saptiva";

export interface ModelService {
  generateText(
    prompt: string,
    systemPrompt?: string,
    model?: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<string>;
}

/**
 * ModelFactory provee acceso a modelos de AI para la aplicación
 * Esta implementación soporta modelos de texto (Saptiva)
 */
export class ModelFactory {
  private static saptivaService: SaptivaService | null = null;
  private static instance: ModelFactory | null = null;

  private static readonly SAPTIVA_API_KEY = process.env.SAPTIVA_API_KEY!;
  private static readonly SAPTIVA_API_BASE_URL = process.env.SAPTIVA_API_BASE_URL || "https://api.saptiva.com";

  private constructor() {}

  public static getInstance(): ModelFactory {
    if (!this.instance) {
      this.instance = new ModelFactory();
    }
    return this.instance;
  }

  /**
   * Obtiene un servicio de modelo de texto configurado para SAPTIVA
   */
  static getModelService() {
    let apiSettings = null;

    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      const apiSettingsStr = localStorage.getItem("apiSettings");
      if (apiSettingsStr) {
        try {
          apiSettings = JSON.parse(apiSettingsStr);
        } catch (error) {
          console.error("Error parsing API settings:", error);
        }
      }
    }

    const saptivaApiKey =
      apiSettings?.saptivaApiKey || ModelFactory.SAPTIVA_API_KEY;

    ModelFactory.saptivaService = new SaptivaService(
      saptivaApiKey,
      ModelFactory.SAPTIVA_API_BASE_URL
    );

    return ModelFactory.saptivaService;
  }

  /**
   * Servicio de embeddings basado en SAPTIVA
   * (Solo aplica si estás usando un endpoint de embeddings personalizado)
   */
  static getEmbeddingsService() {
    return new SaptivaService(
      ModelFactory.SAPTIVA_API_KEY,
      ModelFactory.SAPTIVA_API_BASE_URL
    );
  }
}
