import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

export async function createChunksFromText(content: string, sourceId: string): Promise<Document[]> {
  try {
    // Crear documento inicial
    const doc = new Document({ 
      pageContent: content, 
      metadata: { source: sourceId } 
    });
    
    // Dividir documento en chunks más pequeños
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const chunks = await splitter.splitDocuments([doc]);
    
    // Añadir metadata adicional
    chunks.forEach((chunk: Document) => {
      chunk.metadata = {
        ...chunk.metadata,
        sourceId,
        chunkId: `${sourceId}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'text'
      };
    });
    
    return chunks;
  } catch (error) {
    console.error('Error procesando texto:', error);
    throw error;
  }
}

export async function createChunksFromUrl(url: string, sourceId: string, title?: string): Promise<Document[]> {
  try {
    // En una implementación real aquí haríamos un fetch para obtener el contenido de la URL
    // Simularemos que obtenemos algún contenido de la URL
    const content = `Contenido extraído de ${url} para demostración. 
    Este es un texto simulado que representaría el contenido real de la página web.
    En una implementación completa, aquí estaría el HTML procesado o el texto extraído de la página.`;
    
    // Usar el título proporcionado o extraer uno de la URL
    const documentTitle = title || url.split('/').pop() || url;
    
    // Crear documento inicial
    const doc = new Document({ 
      pageContent: content, 
      metadata: { 
        source: sourceId,
        url,
        title: documentTitle
      } 
    });
    
    // Dividir documento en chunks más pequeños
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const chunks = await splitter.splitDocuments([doc]);
    
    // Añadir metadata adicional
    chunks.forEach((chunk: Document) => {
      chunk.metadata = {
        ...chunk.metadata,
        sourceId,
        chunkId: `${sourceId}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'url'
      };
    });
    
    return chunks;
  } catch (error) {
    console.error('Error procesando URL:', error);
    throw error;
  }
} 