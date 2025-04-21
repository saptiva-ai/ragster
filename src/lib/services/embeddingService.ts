/**
 * EmbeddingService provides access to AI models for generating embeddings
 * This implementation focuses on the E5 model
 */
export class EmbeddingService {
  private static instance: EmbeddingService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private e5Model: any = null;

  /**
   * Get the singleton instance of EmbeddingService
   */
  public static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  private constructor() {
    // Private constructor to enforce singleton
  }

  /**
   * Get the E5 model for generating embeddings
   * Uses a lazy loading approach to only load the model when needed
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getE5Model(): Promise<any> {
    // Return cached model if available
    if (this.e5Model) {
      return this.e5Model;
    }

    console.log("Checking for existing E5 model instance...");

    try {
      // For client-side, we leverage the transformers.js pipeline
      if (typeof window !== "undefined") {
        console.log("Initializing client-side embedding with E5 model");
        // Check if the model is already loaded
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

        // Create model wrapper with embed method
        this.e5Model = {
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

              // Adjust dimensions if needed to match Pinecone configuration
              const configuredDimensions = parseInt(
                process.env.PINECONE_DIMENSIONS || "1024",
              );
              if (embedding.length !== configuredDimensions) {
                console.warn(
                  `Embedding dimension mismatch: Model returned ${embedding.length} dimensions, but Pinecone expects ${configuredDimensions}. Adjusting dimensions...`,
                );

                // If model returns more dimensions than needed, truncate
                if (embedding.length > configuredDimensions) {
                  return embedding.slice(0, configuredDimensions);
                }

                // If model returns fewer dimensions than needed, pad with zeros (shouldn't happen)
                const paddedEmbedding = [...embedding];
                while (paddedEmbedding.length < configuredDimensions) {
                  paddedEmbedding.push(0);
                }

                // Re-normalize after padding
                const magnitude = Math.sqrt(
                  paddedEmbedding.reduce((sum, val) => sum + val * val, 0),
                );
                return paddedEmbedding.map((val) => val / magnitude);
              }

              return embedding;
            } catch (error) {
              console.error("Error generating embedding with E5 model:", error);
              throw error;
            }
          },
        };

        return this.e5Model;
      } else {
        // Server-side embedding implementation using OpenAI API
        console.log("Initializing server-side embedding with OpenAI API");

        // Check if OpenAI API key is available
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
          throw new Error(
            "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.",
          );
        }

        // Get the configured model from environment variables
        const embeddingModel =
          process.env.PINECONE_MODEL || "text-embedding-3-small";
        console.log(`Using embedding model: ${embeddingModel}`);

        // Create OpenAI embedding wrapper
        this.e5Model = {
          async embed(text: string): Promise<number[]> {
            try {
              let embedding: number[];

              // If using OpenAI model
              if (
                embeddingModel === "text-embedding-3-small" ||
                embeddingModel.startsWith("text-embedding")
              ) {
                // Call OpenAI Embeddings API
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
                      model: embeddingModel,
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
                const responseOpenAI = await response.json();

                console.log("OpenAI API response:", responseOpenAI);

                const data = responseOpenAI;
                embedding = data.data[0].embedding;
              }
              // If using E5 model (or any other model that requires a different API or approach)
              else if (
                embeddingModel.includes("e5") ||
                embeddingModel.includes("multilingual")
              ) {
                // Use the Transformers library server-side via NodeJS
                try {
                  // Here we'd ideally use e5-model in server mode
                  // For now, we'll use OpenAI as a fallback but log that we're not using the configured model
                  console.warn(
                    `Using OpenAI as fallback instead of ${embeddingModel} on server-side. Server-side implementations for specific transformer models coming soon.`,
                  );

                  // Call OpenAI as fallback
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
                  embedding = data.data[0].embedding;
                } catch (e) {
                  console.error(
                    `Error using ${embeddingModel} on server-side:`,
                    e,
                  );
                  throw e;
                }
              } else {
                throw new Error(
                  `Unsupported embedding model: ${embeddingModel}`,
                );
              }

              // Adjust dimensions if needed to match Pinecone configuration
              const configuredDimensions = parseInt(
                process.env.PINECONE_DIMENSIONS || "1024",
              );

              console.log(
                `Configured dimensions: ${configuredDimensions}, Model returned dimensions: ${embedding.length}`,
              );
              if (embedding.length !== configuredDimensions) {
                console.warn(
                  `Embedding dimension mismatch: Model returned ${embedding.length} dimensions, but Pinecone expects ${configuredDimensions}. Adjusting dimensions...`,
                );

                // If model returns more dimensions than needed, truncate
                if (embedding.length > configuredDimensions) {
                  return embedding.slice(0, configuredDimensions);
                }

                // If model returns fewer dimensions than needed, pad with zeros (shouldn't happen)
                const paddedEmbedding = [...embedding];
                while (paddedEmbedding.length < configuredDimensions) {
                  paddedEmbedding.push(0);
                }

                // Re-normalize after padding
                const magnitude = Math.sqrt(
                  paddedEmbedding.reduce((sum, val) => sum + val * val, 0),
                );
                return paddedEmbedding.map((val) => val / magnitude);
              }

              console.log(
                `Generated embedding: ${embedding}, Dimensions: ${embedding.length}`,
              );

              return embedding;
            } catch (error) {
              console.error(
                "Error generating embedding with OpenAI API:",
                error,
              );
              throw error;
            }
          },
        };

        return this.e5Model;
      }
    } catch (error) {
      console.error("Error initializing embedding model:", error);
      throw new Error(
        `Failed to initialize embedding model: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Generate an embedding for the provided text
   * @param text Text to embed
   * @returns Embedding vector as an array of numbers
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    try {
      const model = await this.getE5Model();
      console.log(
        `Generating embedding for text: "${text}" using model ${JSON.stringify(
          model,
        )}`,
      );
      return await model.embed(text);
    } catch (error) {
      console.error("Error generating embedding:", error);
      throw new Error(
        `Failed to generate embedding: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
