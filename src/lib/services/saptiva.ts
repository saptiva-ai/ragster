// SAPTIVA SERVICE
//
// LLM API client for text generation and OCR.
// Used for: 1) Chunk filtering (2nd call), 2) Answer generation (main call)

import { connectToDatabase } from "@/lib/mongodb/client";
import { DEFAULT_MODELS, MODEL_NAMES } from "@/config/models";

export class SaptivaService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    const url = baseUrl || "https://api.saptiva.com";
    // Remove trailing slash to prevent double slash in URL
    this.baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;
  }

  // GENERATE TEXT → Main LLM call to Saptiva API
  // Called by: route.ts (answer generation), chunk-filter.ts (filtering)
  async generateText(
    id: string,
    systemMessage: string,
    userMessage: string,
    model: string = DEFAULT_MODELS.CHAT,
    temperature: number = 0.7,
    maxTokens: number = 1000
  ): Promise<string> {
    try {
      const { db } = await connectToDatabase();
      const collection = db.collection("messages");

      // Correct format per Saptiva API docs:
      // - system: instructions only
      // - user: context + query (no duplication)
      const messages = [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ];

      const payload = {
        model,
        max_tokens: maxTokens,
        messages,
        temperature,
        top_p: 0.95,
      };

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
          `Error en la API de Saptiva (HTTP ${response.status}): ${errorText.substring(0, 100)}...`
        );
      }

      const data = await response.json();

      const sinRazonamiento = data.choices[0].message.content
        .replace(/<think>.*?<\/think>/gs, "")
        .replace(/Thought:.*(\n|$)/gi, "")
        .trim();

      // Don't save internal LLM calls (chunk-filter) to messages
      if (!id.startsWith('chunk-filter')) {
        await collection.insertOne({
          message_id: id,
          message_role: "assistant",
          message: sinRazonamiento,
          timestamp: new Date(),
        });
      }

      return sinRazonamiento;
    } catch (error) {
      console.error("❌ Error al llamar a la API de Saptiva:", error);
      throw error;
    }
  }

  // Extracts text from image/PDF using Saptiva OCR
  async ocrImage(fileBuffer: Buffer, mimeType: string): Promise<string> {
    try {
      const base64 = fileBuffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64}`;

      const payload = {
        model: MODEL_NAMES.OCR,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "OCR this image to markdown." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 8000,
        temperature: 0.1,
      };

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
        throw new Error(`Saptiva OCR error (${response.status}): ${errorText.substring(0, 100)}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error("Saptiva OCR failed:", error);
      throw error;
    }
  }
}
