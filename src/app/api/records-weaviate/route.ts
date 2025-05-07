import {NextResponse} from "next/server";
import weaviate, {WeaviateClient} from "weaviate-client";

const weaviateApiKey = process.env.WEAVIATE_API_KEY!;

async function getWeaviateClient(): Promise<WeaviateClient> {
  return await weaviate.connectToWeaviateCloud(
    process.env.WEAVIATE_HOST!,
    {
      authCredentials: new weaviate.ApiKey(weaviateApiKey),
      headers: {
        "X-Openai-Api-Key": process.env.OPENAI_API_KEY!,
      },
    },
  );
}

export async function GET() {
  try {
    const client = await getWeaviateClient();
    const coll = await client.collections.listAll();

    if (!coll || coll.length === 0) {
      return NextResponse.json({
        success: true,
        records: [],
      });
    }

    const collection = client.collections.get(coll[0].name);
    const response = await collection.query.fetchObjects({
      limit: 10000,
    });

    if (!response || !response.objects || response.objects.length === 0) {
      return NextResponse.json({
        success: true,
        records: [],
      });
    }

    const records = response.objects.map(obj => ({
      id: obj.uuid,
      properties: obj.properties,
    }));

    return NextResponse.json({
      success: true,
      records,
    });
  } catch (error) {
    console.error("Error fetching Weaviate records:", error);
    return NextResponse.json({
      success: false,
      error: "Error fetching records",
      records: [],
    });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, properties } = await request.json();
    const client = await getWeaviateClient();
    const coll = await client.collections.listAll();
    
    if (!coll || coll.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "No collections found" 
      }, { status: 404 });
    }

    const collection = client.collections.get(coll[0].name);
    await collection.data.update({ id, properties });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating Weaviate record:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Error updating record" 
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    const client = await getWeaviateClient();
    const coll = await client.collections.listAll();
    
    if (!coll || coll.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "No collections found" 
      }, { status: 404 });
    }

    const collection = client.collections.get(coll[0].name);
    await collection.data.deleteById(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting Weaviate record:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Error deleting record" 
    }, { status: 500 });
  }
} 