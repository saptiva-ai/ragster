import {NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/mongodb/client";
import {ObjectId} from "mongodb";

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

    // Buscar el lead primero para obtener información relacionada
    const filter: {$or: ({_id?: ObjectId} | {id: string})[]} = {$or: []};

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

    let messages = [];
    const messageIds = new Set<string>();

    // Si el lead tiene un phoneNumber, usarlo para buscar mensajes
    if (lead.phoneNumber) {
      // Primero intentamos encontrar todos los message_id asociados con este número
      const distinctMessageIds = await db
        .collection("messages")
        .distinct("message_id", {user_id: lead.phoneNumber});

      distinctMessageIds.forEach((id) => messageIds.add(id));
    }

    // Si el lead tiene un ID de mensaje, lo agregamos también
    if (lead.message_id) {
      messageIds.add(lead.message_id);
    }

    // Si encontramos message_ids, buscamos todos los mensajes con esos ids
    if (messageIds.size > 0) {
      messages = await db
        .collection("messages")
        .find({message_id: {$in: Array.from(messageIds)}})
        .sort({timestamp: 1})
        .toArray();
    } else {
      // Si no tenemos message_ids, como último recurso, obtenemos todos los mensajes
      // Esto es solo para demostración - en producción querrías limitar esto
      messages = await db
        .collection("messages")
        .find({})
        .sort({timestamp: 1})
        .limit(20)
        .toArray();
    }

    return NextResponse.json({
      success: true,
      messages: messages,
    });
  } catch (error) {
    console.error("Error obtaining messages from MongoDB:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al obtener los mensajes",
      },
      {status: 500},
    );
  }
}
