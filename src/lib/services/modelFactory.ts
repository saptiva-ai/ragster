import {SaptivaService} from "./saptiva";

export type ModelProvider = "saptiva";

export interface ModelService {
  generateText(
    prompt: string,
    systemPrompt?: string,
    model?: string,
    temperature?: number,
    maxTokens?: number,
  ): Promise<string>;
}

/**
 * ModelFactory provee acceso a modelos de AI para la aplicación
 * Esta implementación soporta modelos de texto (Saptiva) y modelos de embeddings (E5)
 */
export class ModelFactory {
  // Servicios para cada proveedor
  private static saptivaService: SaptivaService | null = null;

  // Singleton
  private static instance: ModelFactory | null = null;

  // Valores por defecto
  private static readonly SAPTIVA_API_KEY =
    "va-ai-N3dKAfdHb_oTkmpsAb3tWKisQ6Uf7egVSY2UstRIXPus8Sb7w8GzdNsgBXPfriUkFQ7mfmYl7P6ZS17MA6vbMOW36NXAGOtnhokbjc3kU2c";
  private static readonly SAPTIVA_API_BASE_URL = "https://api.saptiva.com";

  /**
   * Constructor privado para enforcer el patrón singleton
   */
  private constructor() {}

  /**
   * Obtiene una instancia única de ModelFactory
   */
  public static getInstance(): ModelFactory {
    if (!this.instance) {
      this.instance = new ModelFactory();
    }
    return this.instance;
  }

  /**
   * Obtiene un servicio de modelo de texto basado en el proveedor y configuración
   * @param provider Proveedor del modelo (siempre 'saptiva')
   * @param modelId ID del modelo a utilizar
   * @returns Servicio configurado para Saptiva
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
      ModelFactory.SAPTIVA_API_BASE_URL,
    );
    return ModelFactory.saptivaService;
  }

  /**
   * Obtiene el servicio de embeddings de Saptiva
   */
  static getEmbeddingsService() {
    return new SaptivaService(
      ModelFactory.SAPTIVA_API_KEY,
      ModelFactory.SAPTIVA_API_BASE_URL,
    );
  }

  /**
   * Get the E5 model for generating embeddings
   * Uses a lazy loading approach to only load the model when needed
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static async getE5Model(): Promise<any> {
    try {
      // For client-side, we leverage the transformers.js pipeline
      if (typeof window !== "undefined") {
        // Dynamically import the pipeline to avoid SSR issues
        const {pipeline} = await import("@xenova/transformers");

        console.log("Loading E5 model for embeddings...");
        const model = await pipeline(
          "feature-extraction",
          "intfloat/multilingual-e5-large",
          {
            revision: "main",
            quantized: false,
          },
        );

        // Return an object with an embed method that normalizes the embedding
        return {
          async embed(text: string): Promise<number[]> {
            try {
              // Use the proper format for E5 model
              const formattedText = `passage: ${text}`;

              // Generate embedding
              const result = await model(formattedText, {
                pooling: "mean",
                normalize: true,
              });

              // Extract the embedding data as an array
              const embedding = Array.from(result.data) as number[];

              return embedding;
            } catch (error) {
              console.error("Error generating embedding with E5 model:", error);
              throw error;
            }
          },
        };
      } else {
        // Server-side embedding implementation using OpenAI API
        console.log("Inicializando servidor-side embedding con OpenAI API");

        // Verificar si hay una API key de OpenAI configurada
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
          throw new Error(
            "OpenAI API key no configurada. Por favor, configura OPENAI_API_KEY en las variables de entorno.",
          );
        }

        return {
          async embed(text: string): Promise<number[]> {
            try {
              // Llamar a la API de embeddings de OpenAI
              const response = await fetch(
                "https://api.openai.com/v1/embeddings",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${openaiApiKey}`,
                  },
                  body: JSON.stringify({
                    input: text,
                    model: "text-embedding-3-small",
                  }),
                },
              );

              if (!response.ok) {
                const error = await response.json();
                throw new Error(
                  `OpenAI API error: ${
                    error.error?.message || response.statusText
                  }`,
                );
              }

              const data = await response.json();
              const embedding = data.data[0].embedding;

              // Ajustar dimensiones si es necesario para coincidir con la configuración de Pinecone
              const configuredDimensions = parseInt(
                process.env.PINECONE_DIMENSIONS || "1024",
              );
              if (embedding.length !== configuredDimensions) {
                console.warn(
                  `Dimensiones de embedding no coinciden: OpenAI devolvió ${embedding.length} dimensiones, pero Pinecone espera ${configuredDimensions}. Ajustando dimensiones...`,
                );

                // Si OpenAI devuelve más dimensiones de las necesarias, truncar
                if (embedding.length > configuredDimensions) {
                  return embedding.slice(0, configuredDimensions);
                }

                // Si OpenAI devuelve menos dimensiones de las necesarias, rellenar con ceros (no debería ocurrir)
                const paddedEmbedding = [...embedding];
                while (paddedEmbedding.length < configuredDimensions) {
                  paddedEmbedding.push(0);
                }

                // Re-normalizar después de rellenar
                const magnitude = Math.sqrt(
                  paddedEmbedding.reduce((sum, val) => sum + val * val, 0),
                );
                return paddedEmbedding.map((val) => val / magnitude);
              }

              return embedding;
            } catch (error) {
              console.error(
                "Error al generar embeddings con OpenAI API:",
                error,
              );
              throw error;
            }
          },
        };
      }
    } catch (error) {
      console.error("Error initializing E5 model:", error);
      throw new Error(
        `Failed to initialize E5 model: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
