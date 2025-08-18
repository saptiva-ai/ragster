import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb/client";
import { WithId, Document } from "mongodb";

// Define predefined responses for specific conversation IDs
const predefinedResponses: Record<string, string> = {
  a: "This is a predefined response for conversation A.",
  b: "This is a predefined response for conversation B.",
  c: "This is a predefined response for conversation C.",
};

// Define the FormattedMessage interface
interface FormattedMessage {
  _id: string;
  message_id: string;
  message_role: string;
  model: string;
  message: string;
  temperature: number | null;
  max_tokens: number | null;
  timestamp: string;
  user_id: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversationId = typeof id === "string" ? id : "";

  console.log(`API - Solicitud recibida para conversación: ${conversationId}`);

  try {
    const { db } = await connectToDatabase();

    // Obtener los mensajes de la colección messages para esta conversación
    const messages = await db
      .collection("messages")
      .find({ message_id: conversationId })
      .sort({ timestamp: 1 }) // Ordenar cronológicamente para facilitar el procesamiento
      .toArray();

    console.log(
      `API - Encontrados ${messages.length} mensajes en la base de datos`
    );

    // Transformar los documentos para asegurar que todos los campos son válidos
    const formattedMessages: FormattedMessage[] = messages.map(
      (msg: WithId<Document>) => ({
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
      })
    );

    // Verificar si hay mensajes del usuario sin respuesta del asistente
    const messagesWithPredefinedResponses = [...formattedMessages];
    let hasAddedPredefinedResponse = false;

    // Si tenemos una respuesta predefinida para esta conversación y no hay respuestas del asistente
    if (predefinedResponses[conversationId]) {
      console.log(
        `API - Tenemos una respuesta predefinida para ${conversationId}`
      );

      // Comprobar si hay al menos un mensaje del asistente con contenido
      const hasAssistantMessages = formattedMessages.some(
        (msg) => msg.message_role === "assistant" && msg.message.trim() !== ""
      );

      if (!hasAssistantMessages) {
        console.log(
          `API - No hay respuestas del asistente, añadiendo predefinida`
        );

        // Encontrar el primer mensaje de usuario
        const userMessage = formattedMessages.find(
          (msg) => msg.message_role === "user"
        );

        if (userMessage) {
          // Crear un mensaje del asistente con la respuesta predefinida
          const predefinedMessage: FormattedMessage = {
            _id: `predefined-${Date.now()}`,
            message_id: conversationId,
            message_role: "assistant",
            model: "default",
            message: predefinedResponses[conversationId],
            temperature: null,
            max_tokens: null,
            timestamp: new Date(
              new Date(userMessage.timestamp).getTime() + 1000
            ).toISOString(), // 1 segundo después
            user_id: userMessage.user_id,
          };

          // Añadir la respuesta predefinida
          messagesWithPredefinedResponses.push(predefinedMessage);
          hasAddedPredefinedResponse = true;

          console.log(
            `API - Respuesta predefinida añadida: ${predefinedMessage.message.substring(
              0,
              30
            )}...`
          );
        }
      } else {
        console.log(
          `API - Ya hay respuestas del asistente, no se añade predefinida`
        );
      }
    }

    console.log(
      `API - Devolviendo ${messagesWithPredefinedResponses.length} mensajes (${
        hasAddedPredefinedResponse ? "con" : "sin"
      } respuesta predefinida)`
    );

    // Registrar roles de mensajes para depuración
    const roles = messagesWithPredefinedResponses.map((m) => m.message_role);
    console.log(`API - Roles de mensajes: ${JSON.stringify(roles)}`);

    return NextResponse.json({
      success: true,
      messages: messagesWithPredefinedResponses,
      hasAddedPredefinedResponse,
      conversationId,
    });
  } catch (error) {
    console.error("Error al obtener mensajes para esta conversación:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al obtener mensajes para esta conversación",
      },
      { status: 500 }
    );
  }
}