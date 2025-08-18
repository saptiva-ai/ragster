import {NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/mongodb/client";
import {ObjectId} from "mongodb";

// Obtener un lead específico
export async function GET(
  request: Request,
  {params}: {params: Promise<{id: string}>},
) {
  const {id} = await params;
  try {
    // Conectar a MongoDB
    const {db} = await connectToDatabase();

    // Verificar si el ID es un ObjectId válido
    let objectIdLead = null;
    try {
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        objectIdLead = new ObjectId(id);
      }
    } catch (e) {
      console.warn("ID proporcionado no es un ObjectId válido:", id, e);
    }

    // Construir el filtro para buscar el lead
    const filter: {$or: Array<Record<string, unknown>>} = {$or: []};

    if (objectIdLead) {
      filter.$or.push({_id: objectIdLead});
    }

    filter.$or.push({id: id});

    // Obtener el lead
    const lead = await db.collection("leads").findOne(filter);

    if (!lead) {
      return NextResponse.json(
        {
          success: false,
          error: "Lead no encontrado",
        },
        {status: 404},
      );
    }

    // Formatear el lead
    const formattedLead = {
      id: lead._id.toString(),
      whatsappName: lead.whatsappName || lead.name || "Sin nombre",
      phoneNumber: lead.phoneNumber || lead.phone || "",
      registrationDate:
        lead.registrationDate || lead.createdAt || new Date().toISOString(),
      lastMessageDate:
        lead.lastMessageDate || lead.updatedAt || new Date().toISOString(),
      conversationCount: lead.conversationCount || lead.messageCount || 0,
      status: lead.status || "new",
    };

    return NextResponse.json({
      success: true,
      lead: formattedLead,
    });
  } catch (error) {
    console.error("Error obtaining lead from MongoDB:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al obtener los datos del lead",
      },
      {status: 500},
    );
  }
}

// Actualizar un lead
export async function PATCH(
  request: Request,
  {params}: {params: Promise<{id: string}>},
) {
  const {id} = await params;
  try {
    const data = await request.json();

    // Validar que hay datos para actualizar
    if (!data || Object.keys(data).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No se proporcionaron datos para actualizar",
        },
        {status: 400},
      );
    }

    // Conectar a MongoDB
    const {db} = await connectToDatabase();

    // Verificar si el ID es un ObjectId válido
    let objectIdLead = null;
    try {
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        objectIdLead = new ObjectId(id);
      }
    } catch (e) {
      console.warn("ID proporcionado no es un ObjectId válido:", id, e);
    }

    // Construir el filtro para buscar el lead
    const filter: {$or: Array<Record<string, unknown>>} = {$or: []};

    if (objectIdLead) {
      filter.$or.push({_id: objectIdLead});
    }

    filter.$or.push({id: id});

    // Verificar si el lead existe
    const leadExists = await db.collection("leads").findOne(filter);

    if (!leadExists) {
      return NextResponse.json(
        {
          success: false,
          error: "Lead no encontrado",
        },
        {status: 404},
      );
    }

    // Preparar los datos a actualizar
    const updateData: Partial<{
      status: "active" | "inactive" | "new";
      whatsappName: string;
      phoneNumber: string;
    }> = {};

    // Solo permitir actualizar campos específicos
    if (data.status && ["active", "inactive", "new"].includes(data.status)) {
      updateData.status = data.status;
    }

    if (data.whatsappName) {
      updateData.whatsappName = data.whatsappName;
    }

    if (data.phoneNumber) {
      updateData.phoneNumber = data.phoneNumber;
    }

    // Si no hay datos válidos para actualizar
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No se proporcionaron datos válidos para actualizar",
        },
        {status: 400},
      );
    }

    // Actualizar el documento
    const result = await db
      .collection("leads")
      .updateOne(filter, {$set: updateData});

    if (result.matchedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo actualizar el lead",
        },
        {status: 500},
      );
    }

    return NextResponse.json({
      success: true,
      message: "Lead actualizado correctamente",
      updated: updateData,
    });
  } catch (error) {
    console.error("Error updating lead in MongoDB:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al actualizar el lead",
      },
      {status: 500},
    );
  }
}
