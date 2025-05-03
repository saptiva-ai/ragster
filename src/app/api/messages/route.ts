import {NextResponse} from "next/server";
import clientPromise from "../../../lib/mongodb";
import {WithId, Document} from "mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("opico");

    // Obtener los mensajes de la colección messages
    const messages = await db
      .collection("messages")
      .find({})
      .sort({timestamp: -1})
      .toArray();

    // Transformar los documentos para asegurar que todos los campos son válidos

    const formattedMessages = messages.map((msg: WithId<Document>) => ({
      _id: msg._id.toString(),
      message_id: (msg.message_id as string) || "",
      message_role: (msg.message_role as string) || "unknown",
      model: (msg.model as string) || "default",
      message: (msg.message as string) || "",
      temperature:
        msg.temperature !== undefined ? (msg.temperature as number) : null,
      max_tokens:
        msg.max_tokens !== undefined ? (msg.max_tokens as number) : null,
      timestamp: (msg.timestamp as string) || new Date().toISOString(),
      user_id: (msg.user_id as string) || "Unknown User",
    }));

    return NextResponse.json({
      success: true,
      messages: formattedMessages,
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      {success: false, error: "Error al conectar con la base de datos"},
      {status: 500},
    );
  }
}
