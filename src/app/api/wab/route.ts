import {NextRequest, NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/mongodb/client";
import {sendMessageToWABA} from "@/lib/wab/sendMessage";

// POST WABA
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {from, text, type} = body;
    console.log("Recibida solicitud POST:", body);

    const query = text.body;

    try {
      const {db} = await connectToDatabase();
      const settingsCollection = db.collection("settings");

      //Buscar configuracion WABA
      const settings = await settingsCollection.findOne({
        key: "wabaSettings",
      });

      //Buscar model settings
      const modelSettings = await settingsCollection.findOne({
        key: "modelSettings",
      });

      if (query.toLowerCase() === "reset") {
        const {db} = await connectToDatabase();
        const collection = db.collection("messages");
        await collection.deleteMany({message_id: from});

        return NextResponse.json({
          success: true,
          response: "Conversación reiniciada",
        });
      }

      let responseBot = await fetch(
        `${process.env.NEXT_PUBLIC_CHAT_API}/api/query-weaviate`,
        {
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({
            message_id: from,
            query,
            modelId: modelSettings?.data?.modelId ?? "",
            temperature: modelSettings?.data?.temperature ?? 0.7,
            systemPrompt:
              modelSettings?.data?.systemPrompt ??
              "Eres un asistente AI que responde preguntas basándose en los documentos proporcionados. Utiliza solo la información de las fuentes para responder. Si la respuesta no está en los documentos, dilo claramente.",
            source: "wab",
            topK: 5,
          }),
        },
      )
        .then((res) => {
          return res.text();
        })
        .catch((e) => {
          return {
            error: true,
            code: 500,
            message: e,
          };
        });

      if (typeof responseBot === "string") {
        responseBot = JSON.parse(responseBot);
      }

      const response = await sendMessageToWABA({
        data: {
          to: from,
          message:
            typeof responseBot === "object" && "answer" in responseBot
              ? responseBot.answer
              : "Respuesta no disponible",
          type: type,
        },
        settings: settings,
      });

      console.log(`Respuesta de WABA: ${JSON.stringify(response)}`);

      return NextResponse.json({
        success: false,
        response: response,
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: "Error al procesar la solicitud",
          details: error instanceof Error ? error.message : "Error desconocido",
        },
        {status: 500},
      );
    }
  } catch (error) {
    console.error("Error al procesar la solicitud:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al procesar la solicitud",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      {status: 500},
    );
  }
}
