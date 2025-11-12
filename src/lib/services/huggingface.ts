import { connectToDatabase } from "@/lib/mongodb/client";

/**
 * Service for interacting with Hugging Face vLLM endpoints
 * Compatible with OpenAI chat completions API
 */
export class HuggingFaceService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string, model: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.model = model;
    // Remove trailing slash to prevent double slash in URL
    this.baseUrl = baseUrl
      ? baseUrl.endsWith("/")
        ? baseUrl.slice(0, -1)
        : baseUrl
      : "https://api-inference.huggingface.co/models";
  }

  /**
   * Generate text using Hugging Face vLLM endpoint
   * Uses OpenAI-compatible API format
   * Always uses temperature 0.2 for consistency
   */
  async generateText(
    id: string,
    prompt: string,
    query: string,
    model?: string,
    temperature?: number,
    maxTokens: number = 1000
  ): Promise<string> {
    try {
      const { db } = await connectToDatabase();
      const collection = db.collection("messages");

      const messages = [
        { role: "system", content: prompt },
        { role: "user", content: query },
      ];

      // Always use temperature 0.2 for HuggingFace fallback
      // vLLM endpoints need to query /v1/models first to get the correct model name
      // Let's fetch the available models first
      let actualModelName = this.model;

      try {
        const modelsResponse = await fetch(`${this.baseUrl}/v1/models`, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        });

        if (modelsResponse.ok) {
          const modelsData = await modelsResponse.json();
          // vLLM returns { "object": "list", "data": [{ "id": "model-name", ... }] }
          if (modelsData.data && modelsData.data.length > 0) {
            actualModelName = modelsData.data[0].id;
            console.log(`Found vLLM model: ${actualModelName}`);
          }
        }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        console.log(`Could not fetch models list, using configured model: ${this.model}`);
      }

      const payload = {
        model: actualModelName,
        max_tokens: maxTokens,
        messages,
        temperature: 0.2, // Fixed temperature
        top_p: 0.95,
      };

      console.log(
        `Calling Hugging Face vLLM endpoint: ${this.baseUrl}/v1/chat/completions`
      );
      console.log(`Using model: ${actualModelName}`);

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Hugging Face API error (HTTP ${response.status}): ${errorText.substring(0, 100)}...`
        );
      }

      const data = await response.json();

      // Extract response text and clean special tokens
      let cleanedContent = data.choices[0].message.content;

      // Remove reasoning tags
      cleanedContent = cleanedContent
        .replace(/<think>.*?<\/think>/gs, "")
        .replace(/Thought:.*(\n|$)/gi, "");

      // Remove special tokens specific to KAL model (including partial/malformed ones)
      cleanedContent = cleanedContent
        .replace(/<\|eot_id\|>/g, "")
        .replace(/<\|end_of_text\|>/g, "")
        .replace(/<\|begin_of_text\|>/g, "")
        .replace(/<\|start_header_id\|>/g, "")
        .replace(/<\|end_header_id\|>/g, "")
        .replace(/\|eot_id\|>/g, "")
        .replace(/eot_id\|>/g, "")
        .replace(/\|end_of_text\|>/g, "")
        .replace(/end_of_text\|>/g, "");

      // Remove system prompt repetitions and leftover fragments
      cleanedContent = cleanedContent
        .replace(/You are a helpful AI assistant\./g, "")
        .replace(/<You are a helpful AI assistant\./g, "")
        .replace(/<You are a helpful AI assistant/g, "");

      // Clean up any remaining isolated < or > at the beginning/end
      cleanedContent = cleanedContent
        .replace(/^[<>\s]+/g, "")
        .replace(/[<>\s]+$/g, "");

      const sinRazonamiento = cleanedContent.trim();

      await collection.insertOne({
        message_id: id,
        message_role: "assistant",
        message: sinRazonamiento,
        timestamp: new Date(),
        provider: "huggingface",
      });

      console.log(`Hugging Face response generated successfully`);

      return sinRazonamiento;
    } catch (error) {
      console.error("Error calling Hugging Face API:", error);
      throw error;
    }
  }
}
