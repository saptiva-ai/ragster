import { connectToDatabase } from "@/lib/mongodb/client";

// Servicio para interactuar con la API de Saptiva
export class SaptivaService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = "https://api.saptiva.com") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Realiza una solicitud a la API de Saptiva para generar texto
   */
  async generateText(
    id: string,
    prompt: string,
    query: string,
    model: string = "Saptiva Turbo",
    temperature: number = 0.7,
    maxTokens: number = 1000
  ): Promise<string> {
    try {
      const { db } = await connectToDatabase();
      const collection = db.collection("messages");

      const messages = [
        { role: "system", content: prompt },
        { role: "user", content: query },
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

      await collection.insertOne({
        message_id: id,
        message_role: "assistant",
        message: sinRazonamiento,
        timestamp: new Date(),
      });

      return sinRazonamiento;
    } catch (error) {
      console.error("❌ Error al llamar a la API de Saptiva:", error);
      throw error;
    }
  }
}
