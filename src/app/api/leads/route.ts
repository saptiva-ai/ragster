import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb/client';

export async function GET() {
  try {
    // Conectar a MongoDB
    const { db } = await connectToDatabase();
    
    // Obtener la colección de leads
    const leads = await db.collection('leads')
      .find({})
      .sort({ registrationDate: -1 }) // Ordenar por fecha de registro (más reciente primero)
      .toArray();
    
    // Formatear los datos si es necesario
    const formattedLeads = leads.map(lead => ({
      id: lead._id.toString(),
      whatsappName: lead.whatsappName || lead.name || "Sin nombre",
      phoneNumber: lead.phoneNumber || lead.phone || "",
      registrationDate: lead.registrationDate || lead.createdAt || new Date().toISOString(),
      lastMessageDate: lead.lastMessageDate || lead.updatedAt || new Date().toISOString(),
      conversationCount: lead.conversationCount || lead.messageCount || 0,
      status: lead.status || "new"
    }));
    
    return NextResponse.json({ 
      success: true, 
      leads: formattedLeads 
    });
  } catch (error) {
    console.error('Error obtaining leads from MongoDB:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Error al obtener datos de leads' 
    }, { status: 500 });
  }
} 