import {NextRequest, NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/mongodb/client";
import {weaviateClient} from "@/lib/services/weaviate-client";
import {getServerSession} from "next-auth";
import {authOptions} from "@/lib/auth";

export async function DELETE(req: NextRequest) {
  const {db} = await connectToDatabase();
  const fileColection = db.collection("file");

  try {
    // Get user from session for collection isolation
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({error: "Unauthorized"}, {status: 401});
    }
    const userId = session.user.id;

    const body = await req.json();
    const {name} = body;

    if (!name) {
      return NextResponse.json(
        {error: "Se requiere el Name para eliminar la fuente"},
        {status: 400},
      );
    }

    // Use user-specific collection for data isolation
    const collection = await weaviateClient.getUserCollection(userId);
    const collectionName = weaviateClient.getUserCollectionName(userId);

    console.log(
      `User collection ${collectionName}:`,
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
