import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';

// Función para inicializar y obtener un índice de Pinecone
async function getPineconeIndex() {
  const pineconeApiKey = process.env.PINECONE_API_KEY;
  const pineconeIndex = process.env.PINECONE_INDEX || 'ragster';
  const pineconeHost = process.env.PINECONE_HOST;
  
  if (!pineconeApiKey) {
    throw new Error('API Key de Pinecone no configurada');
  }
  
  if (!pineconeHost) {
    throw new Error('Host de Pinecone no configurado');
  }
  
  console.log(`Inicializando Pinecone con índice: ${pineconeIndex} y host: ${pineconeHost}`);
  
  try {
    // Crear el cliente de Pinecone y conectarse directamente al índice
    const pinecone = new Pinecone({
      apiKey: pineconeApiKey,
    });
    
    // Obtener el índice directamente sin verificación previa
    return pinecone.index(pineconeIndex);
  } catch (error) {
    console.error('Error al obtener índice Pinecone:', error);
    throw error;
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Se requiere ID para eliminar la fuente' },
        { status: 400 }
      );
    }
    
    // Obtener el índice de Pinecone
    const pineconeIndex = await getPineconeIndex();
    
    // Primero, consultar vectores con ese sourceId para obtener sus IDs
    const dimensions = parseInt(process.env.PINECONE_DIMENSIONS || "1536");
    const queryResponse = await pineconeIndex.query({
      vector: Array(dimensions).fill(0).map(() => Math.random() * 2 - 1), // Vector aleatorio con dimensión correcta
      topK: 1000,
      includeMetadata: true,
      filter: { sourceId: { $eq: id } }
    });
    
    // Si no hay resultados, la fuente no existe
    if (!queryResponse.matches || queryResponse.matches.length === 0) {
      return NextResponse.json(
        { error: 'Fuente no encontrada en Pinecone' },
        { status: 404 }
      );
    }
    
    // Extraer los IDs de los vectores a eliminar
    const vectorIds = queryResponse.matches.map(match => match.id);
    
    console.log(`Eliminando ${vectorIds.length} vectores de Pinecone para la fuente ${id}`);
    
    // Eliminar los vectores en lotes
    const batchSize = 100;
    for (let i = 0; i < vectorIds.length; i += batchSize) {
      const batch = vectorIds.slice(i, i + batchSize);
      await pineconeIndex.deleteMany(batch);
    }
    
    return NextResponse.json({
      success: true,
      message: `Fuente eliminada correctamente. Se eliminaron ${vectorIds.length} vectores.`
    });
    
  } catch (error) {
    console.error('Error al eliminar la fuente:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al procesar la solicitud' },
      { status: 500 }
    );
  }
} 