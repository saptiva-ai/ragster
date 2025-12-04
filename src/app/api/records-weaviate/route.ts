import { NextResponse } from "next/server";
import weaviate from "weaviate-ts-client";
import axios from "axios";
import { MODEL_NAMES } from "@/config/models";

const client = weaviate.client({
  scheme: "http",
  host: "localhost:8080",
});

// 🔍 GET: Obtener registros existentes
export async function GET() {
  try {
    // 🔹 List all collections in Weaviate
    const schema = await client.schema.getter().do();

    if (!schema.classes || schema.classes.length === 0) {
      return NextResponse.json({ success: true, records: [] });
    }

    const className = schema.classes[0]?.class;

    if (!className) {
      return NextResponse.json({ success: true, records: [] });
    }

    // 🔹 Fetch all objects from the first class in the schema
    const response = await client.data
      .getter()
      .withClassName(className)
      .withLimit(1000)
      .do();

    if (!response || !response.objects || response.objects.length === 0) {
      return NextResponse.json({ success: true, records: [] });
    }

    const records = response.objects.map((obj) => ({
      id: obj.id,
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

// ➕ POST: Crear nuevo registro manualmente
export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { success: false, error: "Texto faltante para generar vector" },
        { status: 400 }
      );
    }

    // Obtener clase para insertar (API v1)
    const schema = await client.schema.getter().do();

    if (!schema.classes || schema.classes.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron clases en el esquema" },
        { status: 404 }
      );
    }

    const className = schema.classes[0].class;

    if (!className) {
      return NextResponse.json(
        { success: false, error: "No se encontró el nombre de la clase" },
        { status: 404 }
      );
    }

    // 🧠 Generar embedding con SAPTIVA
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

    // 🎯 Propiedades del registro
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

    // 🚀 Insertar en Weaviate usando la API clásica (v1)
    const result = await client.data
      .creator()
      .withClassName(className)
      .withProperties(properties)
      .withVector(vector)
      .do();

    console.log("✅ Registro creado correctamente en Weaviate:", result);

    return NextResponse.json({
      success: true,
      id: result?.id ?? null,
    });
  } catch (error: any) {
    console.error("❌ Error al crear registro en Weaviate:", error);
    return NextResponse.json(
      { success: false, error: error.message ?? "Error al crear el registro" },
      { status: 500 }
    );
  }
}

// 🗑️ DELETE: Eliminar registro
export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();

    // Get schema and pick the first class to delete from
    const schema = await client.schema.getter().do();

    if (!schema.classes || schema.classes.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron clases en el esquema" },
        { status: 404 }
      );
    }

    const className = schema.classes[0].class;

    if (!className) {
      return NextResponse.json({
        success: false,
        error: "No se encontró el nombre de la clase",
      });
    }

    await client.data.deleter().withClassName(className).withId(id).do();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Error eliminando registro:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar registro" },
      { status: 500 }
    );
  }
}

// ✏️ PUT: Actualizar registro existente
export async function PUT(request: Request) {
  try {
    const { id, properties } = await request.json();

    // Validar entrada
    if (!id || typeof properties?.text !== "string") {
      return NextResponse.json(
        { success: false, error: "ID o texto faltante" },
        { status: 400 }
      );
    }

    // Obtener clase (API clásica v1)
    const schema = await client.schema.getter().do();
    if (!schema.classes || schema.classes.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron clases en el esquema" },
        { status: 404 }
      );
    }
    const className = schema.classes[0].class;
    if (!className) {
      return NextResponse.json(
        { success: false, error: "No se encontró el nombre de la clase" },
        { status: 404 }
      );
    }

    // 🧠 Generar nuevo embedding con SAPTIVA
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

    // ✏️ Actualizar en Weaviate usando la API clásica (v1)
    await client.data
      .updater()
      .withClassName(className)
      .withId(id)
      .withProperties(properties)
      .withVector(vector)
      .do();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Error actualizando registro:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar registro" },
      { status: 500 }
    );
  }
}
