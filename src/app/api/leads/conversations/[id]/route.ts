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

    // Construir el filtro para buscar el lead
    const filter: {$or: Array<Record<string, unknown>>} = {$or: []};

    if (objectIdLead) {
      filter.$or.push({_id: objectIdLead});
    }

    filter.$or.push({id: id});

    // Verificar si el lead existe
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

    // Construir filtro para buscar conversaciones
    const conversationFilter: {$or: Array<Record<string, unknown>>} = {$or: []};

    if (objectIdLead) {
      conversationFilter.$or.push({leadId: objectIdLead});
      conversationFilter.$or.push({"lead._id": objectIdLead});
    }

    conversationFilter.$or.push({leadId: id});
    conversationFilter.$or.push({"lead.id": id});

    if (lead.phoneNumber) {
      conversationFilter.$or.push({phoneNumber: lead.phoneNumber});
    }

    // Obtener las conversaciones asociadas al lead
    const conversations = await db
      .collection("conversations")
      .find(conversationFilter)
      .sort({date: -1, createdAt: -1})
      .toArray();

    // Formatear las conversaciones
    const formattedConversations = conversations.map((conv) => {
      return {
        id: conv._id.toString(),
        date: conv.date || conv.createdAt || new Date().toISOString(),
        messages: Array.isArray(conv.messages)
          ? conv.messages.map(
              (msg: {
                role?: string;
                isFromUser?: boolean;
                content?: string;
                text?: string;
                message?: string;
                timestamp?: string;
                createdAt?: string;
              }) => ({
                role: msg.role || (msg.isFromUser ? "user" : "assistant"),
                content: msg.content || msg.text || msg.message || "",
                timestamp:
                  msg.timestamp || msg.createdAt || new Date().toISOString(),
              }),
            )
          : [],
      };
    });

    return NextResponse.json({
      success: true,
      conversations: formattedConversations,
    });
  } catch (error) {
    console.error("Error obtaining conversations from MongoDB:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al obtener las conversaciones",
      },
      {status: 500},
    );
  }
}
