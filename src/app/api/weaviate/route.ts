import {NextResponse} from "next/server";

import weaviate, {WeaviateClient} from "weaviate-client";

const weaviateApiKey = process.env.WEAVIATE_API_KEY!;

export async function GET() {
  const client: WeaviateClient = await weaviate.connectToWeaviateCloud(
    process.env.WEAVIATE_HOST!,
    {
      authCredentials: new weaviate.ApiKey(weaviateApiKey),
    },
  );
  try {
    const coll = await client.collections.listAll();

    if (coll.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No se encontraron colecciones",
        sources: [],
      });
    }

    const collection = await client.collections.get(coll[0].name);
    console.log("Colección documents:", JSON.stringify(collection, null, 2));

    if (!collection) {
      return NextResponse.json({
        success: false,
        error: "No se encontró la colección",
        sources: [],
      });
    }

    const response = await collection.query.bm25(
      "Lista de todas las fuentes disponibles",
      {
        limit: 1,
      },
    );

    console.log("Respuesta de Weaviate:", response.objects);
    const data = [response.objects[0].properties];

    data[0].id = response.objects[0].uuid;

    console.log("Fuentes:", data);

    return NextResponse.json({
      success: true,
      sources: data,
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
