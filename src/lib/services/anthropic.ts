// Servicio para interactuar con la API de Anthropic (Claude)
export class AnthropicService {
  private apiKey: string;
  private baseUrl: string = 'https://api.anthropic.com';
  private apiVersion: string = '2023-06-01';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Realiza una solicitud a la API de Anthropic (Claude) para generar texto
   */
  async generateText(
    prompt: string,
    systemPrompt: string = '',
    model: string = 'claude-3-sonnet-20240229',
    temperature: number = 0.7,
    maxTokens: number = 1000
  ): Promise<string> {
    try {
      const url = `${this.baseUrl}/v1/messages`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
          'anthropic-version': this.apiVersion
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: prompt }
          ],
          system: systemPrompt,
          temperature,
          max_tokens: maxTokens
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Error en la API de Anthropic: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      console.error('Error al llamar a la API de Anthropic:', error);
      throw error;
    }
  }
} 