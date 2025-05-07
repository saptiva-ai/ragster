import {NextResponse} from "next/server";
import weaviate, {WeaviateClient} from "weaviate-client";
import {connectToDatabase} from "@/lib/mongodb/client";

const weaviateApiKey = process.env.WEAVIATE_API_KEY!;

export async function GET() {
  const client: WeaviateClient = await weaviate.connectToWeaviateCloud(
    process.env.WEAVIATE_HOST!,
    {
      authCredentials: new weaviate.ApiKey(weaviateApiKey),
      headers: {
        "X-Openai-Api-Key": process.env.OPENAI_API_KEY!,
      },
    },
  );
  const {db} = await connectToDatabase();
  const fileColection = db.collection("file");
  try {
    const coll = await client.collections.listAll();

    if (!coll || coll.length === 0) {
      return NextResponse.json({
        success: true,
        sources: [],
      });
    }

    const collection = client.collections.get(coll[0].name);

    const response = await collection.query.bm25(
      "Lista de todas las fuentes disponibles",
      {
        limit: 1,
      },
    );

    if (!response || !response.objects || response.objects.length === 0) {
      return NextResponse.json({
        success: true,
        sources: [],
      });
    }

    const data = [response.objects[0].properties];

    data[0].id = response.objects[0].uuid;

    const file = await fileColection.findOne({
      status: 2,
    });

    console.log("Archivo:", file);

    return NextResponse.json({
      success: true,
      sources: data,
      file: file ? data[0].id : null,
    });
  } catch (error) {
    console.error("Error al consultar Pinecone:", error);
    return NextResponse.json({
      success: false,
      error: "Error al consultar Pinecone",
      sources: [],
    });
  }
}
