import { NextRequest, NextResponse } from "next/server";
import weaviate from "weaviate-ts-client";
import { connectToDatabase } from "@/lib/mongodb/client";

export async function DELETE(req: NextRequest) {
  const client = weaviate.client({
    scheme: "http",
    host: process.env.WEAVIATE_HOST || "localhost:8080",
  });

  const { db } = await connectToDatabase();
  const fileColection = db.collection("file");

  try {
    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Se requiere el Name para eliminar la fuente" },
        { status: 400 }
      );
    }

    const delete_collection = await client.batch
      .objectsBatchDeleter()
      .withClassName("DocumentChunk")
      .withWhere({
        path: ["sourceName"],
        operator: "Equal",
        valueText: name,
      })
      .do();

    await fileColection.deleteOne({ filename: name });

    return NextResponse.json(
      {
        success: true,
        message: "Fuente eliminada correctamente",
        data: delete_collection,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al eliminar la fuente:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al procesar la solicitud",
      },
      { status: 500 }
    );
  }
}
