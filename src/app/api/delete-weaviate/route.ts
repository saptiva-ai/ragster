import {NextRequest, NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/mongodb/client";
import {weaviateClient} from "@/lib/services/weaviate-client";

export async function DELETE(req: NextRequest) {
  const {db} = await connectToDatabase();
  const fileColection = db.collection("file");

  try {
    const body = await req.json();
    const {name} = body;

    if (!name) {
      return NextResponse.json(
        {error: "Se requiere el Name para eliminar la fuente"},
        {status: 400},
      );
    }

    const collection = await weaviateClient.getCollection("DocumentChunk");

    console.log(
      "Colección DocumentChunk:",
      JSON.stringify(collection, null, 2),
    );

    if (!collection) {
      return NextResponse.json(
        {error: "No se encontró la colección en Weaviate"},
        {status: 404},
      );
    }

    const delete_collection = await collection.data.deleteMany(
      collection.filter.byProperty("sourceName").equal(name),
    );

    await fileColection.deleteOne({filename: name});

    return NextResponse.json(
      {
        success: true,
        message: "Fuente eliminada correctamente",
        data: delete_collection,
      },
      {status: 200},
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
      {status: 500},
    );
  }
}
