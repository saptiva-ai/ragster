// Servicio para interactuar con la API de Saptiva
export class SaptivaService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.saptiva.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Realiza una solicitud a la API de Saptiva para generar texto
   */
  async generateText(
    prompt: string,
    systemPrompt: string = '',
    model: string = 'Saptiva Turbo',
    temperature: number = 0.7,
    maxTokens: number = 1000
  ): Promise<string> {
    try {
      console.log(`Llamando a Saptiva API: ${this.baseUrl}`);
      console.log(`Con modelo: ${model}`);
      
      const payload = {
        modelName: model,
        newTokens: maxTokens,
        sysPrompt: systemPrompt,
        message: prompt,
        temperature: temperature
      };
      
      console.log('Payload:', JSON.stringify(payload));
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      // Si la respuesta no es ok, manejamos el error
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(`Error en la API de Saptiva: ${errorData.error?.message || errorData.message || JSON.stringify(errorData)}`);
        } else {
          const errorText = await response.text();
          throw new Error(`Error en la API de Saptiva: HTTP ${response.status}: ${errorText.substring(0, 100)}...`);
        }
      }

      // Verificamos el tipo de contenido
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`La API de Saptiva no devolvió JSON (${contentType}): ${text.substring(0, 100)}...`);
      }

      // Parseamos la respuesta JSON
      const data = await response.json();
      
      console.log('Respuesta de Saptiva:', JSON.stringify(data));
      
      // Formato esperado: { "error": false, "status": 200, "response": "..." }
      if (data.error === false && data.status === 200 && data.response) {
        return data.response;
      }
      
      // Si no tiene el formato esperado, revisamos si tiene el formato de la otra API
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content;
      }
      
      console.warn('Respuesta inesperada de Saptiva API:', JSON.stringify(data).substring(0, 200));
      return data.response || "Lo siento, no pude generar una respuesta adecuada.";
    } catch (error) {
      console.error('Error al llamar a la API de Saptiva:', error);
      throw error;
    }
  }

  /**
   * Genera embeddings utilizando OpenAI como respaldo ya que Saptiva no expone directamente un endpoint de embeddings
   */
  async generateEmbeddings(text: string): Promise<number[]> {
    try {
      console.log('Generando embeddings para texto con OpenAI como respaldo:', text.substring(0, 50) + '...');
      
      // Verificar si hay una API key de OpenAI configurada
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        throw new Error('OpenAI API key no configurada. Por favor, configura OPENAI_API_KEY en las variables de entorno.');
      }
      
      // Llamar a la API de embeddings de OpenAI
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          input: text,
          model: 'text-embedding-3-small'
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }
      
      const data = await response.json();
      const embedding = data.data[0].embedding;
      
      // Ajustar dimensiones si es necesario para coincidir con la configuración de Pinecone
      const configuredDimensions = parseInt(process.env.PINECONE_DIMENSIONS || "1024");
      if (embedding.length !== configuredDimensions) {
        console.warn(`Dimensiones de embedding no coinciden: OpenAI devolvió ${embedding.length} dimensiones, pero Pinecone espera ${configuredDimensions}. Ajustando dimensiones...`);
        
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
        const magnitude = Math.sqrt(paddedEmbedding.reduce((sum, val) => sum + val * val, 0));
        return paddedEmbedding.map(val => val / magnitude);
      }
      
      return embedding;
    } catch (error) {
      console.error('Error al generar embeddings con OpenAI como respaldo:', error);
      throw error;
    }
  }
} 