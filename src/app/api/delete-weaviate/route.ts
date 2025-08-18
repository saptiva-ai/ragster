import {NextRequest, NextResponse} from "next/server";
import weaviate, {WeaviateClient} from "weaviate-client";
import {connectToDatabase} from "@/lib/mongodb/client";

const weaviateApiKey = process.env.WEAVIATE_API_KEY!;

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

    const client: WeaviateClient = await weaviate.connectToWeaviateCloud(
      process.env.WEAVIATE_HOST!,
      {
        authCredentials: new weaviate.ApiKey(weaviateApiKey),
      },
    );

    const collection = await client.collections.get("DocumentChunk");

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

    await fileColection.deleteMany({status: 2});

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
