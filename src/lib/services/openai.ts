// Servicio para interactuar con la API de OpenAI
export class OpenAIService {
  private apiKey: string;
  private baseUrl: string = 'https://api.openai.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Realiza una solicitud a la API de OpenAI para generar texto
   */
  async generateText(
    prompt: string,
    systemPrompt: string = '',
    model: string = 'gpt-4',
    temperature: number = 0.7,
    maxTokens: number = 1000
  ): Promise<string> {
    try {
      const url = `${this.baseUrl}/v1/chat/completions`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature,
          max_tokens: maxTokens
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Error en la API de OpenAI: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error al llamar a la API de OpenAI:', error);
      throw error;
    }
  }

  /**
   * Realiza una solicitud a la API de OpenAI para generar embeddings
   */
  async generateEmbeddings(text: string, model: string = 'text-embedding-3-small'): Promise<number[]> {
    try {
      const url = `${this.baseUrl}/v1/embeddings`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          input: text,
          model
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Error en la API de OpenAI (embeddings): ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('Error al generar embeddings con OpenAI:', error);
      throw error;
    }
  }
} 