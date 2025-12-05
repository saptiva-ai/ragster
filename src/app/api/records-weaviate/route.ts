import { NextResponse } from "next/server";
import axios from "axios";
import { MODEL_NAMES } from "@/config/models";
import { weaviateClient } from "@/lib/services/weaviate-client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ➕ POST: Crear nuevo registro manualmente
export async function POST(request: Request) {
  try {
    // Auth: Get current user from session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { success: false, error: "Texto faltante para generar vector" },
        { status: 400 }
      );
    }

    // Ensure user collection exists and get it
    await weaviateClient.ensureUserCollectionExists(userId);
    const collection = await weaviateClient.getUserCollection(userId);

    // 🧠 Embedding con SAPTIVA
    // Fixed: Removed "stream: false" - SAPTIVA Embed API only accepts "model" and "prompt"
    const embeddingResponse = await axios.post(
      process.env.EMBEDDING_API_URL!,
      {
        model: MODEL_NAMES.EMBEDDING,
        prompt: text,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SAPTIVA_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (
      !embeddingResponse.data ||
      !Array.isArray(embeddingResponse.data.embeddings)
    ) {
      throw new Error("Respuesta de embedding inválida");
    }

    const vector = embeddingResponse.data.embeddings;

    // 🎯 Estructura unificada de propiedades
    const properties = {
      sourceName: "Manual",
      uploadDate: new Date().toISOString(),
      chunkIndex: 0,
      totalChunks: 1,
      sourceType: "manual",
      sourceSize: text.length.toString(),
      sourceNamespace: "default",
      text: text.trim(),
    };

    const result = await collection.data.insert({
      properties,
      vectors: vector,
    });

    console.log("✅ Registro creado correctamente en Weaviate:", result);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Error al crear registro en Weaviate:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear el registro" },
      { status: 500 }
    );
  }
}


// 🔍 GET: Obtener registros existentes
export async function GET() {
  try {
    // Auth: Get current user from session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", records: [] },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    // Get user-specific collection
    const collection = await weaviateClient.getUserCollection(userId);
    const response = await collection.query.fetchObjects({ limit: 10000 });

    if (!response || !response.objects || response.objects.length === 0) {
      return NextResponse.json({ success: true, records: [] });
    }

    const records = response.objects.map((obj) => ({
      id: obj.uuid,
      properties: obj.properties,
    }));

    return NextResponse.json({ success: true, records });
  } catch (error) {
    console.error("❌ Error obteniendo registros de Weaviate:", error);
    return NextResponse.json({
      success: false,
      error: "Error al obtener registros",
      records: [],
    });
  }
}

// ✏️ PUT: Actualizar registro existente
export async function PUT(request: Request) {
  try {
    // Auth: Get current user from session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const { id, properties } = await request.json();

    if (!id || typeof properties?.text !== "string") {
      return NextResponse.json(
        { success: false, error: "ID o texto faltante" },
        { status: 400 }
      );
    }

    // Get user-specific collection
    const collection = await weaviateClient.getUserCollection(userId);

    // 🔁 Obtener nuevo vector desde SAPTIVA
    // Fixed: Removed "stream: false" - SAPTIVA Embed API only accepts "model" and "prompt"
    const embeddingResponse = await axios.post(
      process.env.EMBEDDING_API_URL!,
      {
        model: MODEL_NAMES.EMBEDDING,
        prompt: properties.text,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SAPTIVA_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (
      !embeddingResponse.data ||
      !Array.isArray(embeddingResponse.data.embeddings)
    ) {
      throw new Error("Respuesta de embedding inválida");
    }

    const vector = embeddingResponse.data.embeddings;

    await collection.data.update({ id, properties, vectors: vector });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Error actualizando registro:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar registro" },
      { status: 500 }
    );
  }
}

// 🗑️ DELETE: Eliminar registro
export async function DELETE(request: Request) {
  try {
    // Auth: Get current user from session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const { id } = await request.json();

    // Get user-specific collection
    const collection = await weaviateClient.getUserCollection(userId);
    await collection.data.deleteById(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Error eliminando registro:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar registro" },
      { status: 500 }
    );
  }
}
