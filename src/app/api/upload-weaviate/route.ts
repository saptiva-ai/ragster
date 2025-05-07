import {NextRequest, NextResponse} from "next/server";
import mammoth from "mammoth";
import weaviate, {WeaviateClient} from "weaviate-client";
import {connectToDatabase} from "@/lib/mongodb/client";

const weaviateApiKey = process.env.WEAVIATE_API_KEY!;

const client: WeaviateClient = await weaviate.connectToWeaviateCloud(
  process.env.WEAVIATE_HOST!,
  {
    authCredentials: new weaviate.ApiKey(weaviateApiKey),
    headers: {
      "X-Openai-Api-Key": process.env.OPENAI_API_KEY!,
    },
  },
);

// Asegúrate que la clase existe en Weaviate
async function ensureWeaviateClassExists(className: string) {
  // 1. Listar todas las colecciones/clases
  const collections = await client.collections.listAll();
  const exists = collections.some(
    (col: {name: string}) => col.name === className,
  );

  if (!exists) {
    console.log(`La colección ${className} no existe. Creando...`);
    await client.collections.create({
      name: className,
      vectorizers: [],
      properties: [
        {name: "text", dataType: "text"},
        {name: "sourceName", dataType: "text"},
        {name: "sourceType", dataType: "text"},
        {name: "sourceSize", dataType: "text"},
        {name: "uploadDate", dataType: "text"},
        {name: "chunkIndex", dataType: "int"},
        {name: "totalChunks", dataType: "int"},
        {name: "sourceNamespace", dataType: "text"},
        {name: "prevChunkIndex", dataType: "int"},
        {name: "nextChunkIndex", dataType: "int"},
      ],
    });
    // Esperar a que la colección esté disponible (opcional: reintentos)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log(`Colección ${className} creada.`);
  } else {
    console.log(`La colección ${className} ya existe.`);
  }
}

async function extractTextFromFile(
  buffer: ArrayBuffer,
  file: File,
): Promise<string> {
  const mime = file.type;

  if (mime === "application/pdf") {
    return ""; // Integrar con pdfParse o PyMuPDF si quieres
  }

  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({buffer: Buffer.from(buffer)});
    return result.value || "";
  }

  if (mime === "text/plain") {
    return new TextDecoder("utf-8").decode(buffer);
  }

  throw new Error(`Tipo de archivo no soportado: ${mime}`);
}

interface Chunk {
  text: string;
  question: string;
  answer: string;
}

/*async function getOpenAIEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const response = await axios.post(
    "https://api.openai.com/v1/embeddings",
    {
      input: text,
      model: "text-embedding-3-small",
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );
  return response.data.data[0].embedding;
}*/

async function insertDataToWeaviate(
  chunks: Chunk[],
  filename: string,
  file: File,
  formNamespace: string,
  idUploadFile: import("mongodb").ObjectId,
): Promise<void> {
  const {db} = await connectToDatabase();
  const fileColection = db.collection("file");

  // Procesar embeddings y relaciones contextuales
  const enrichedChunks = await Promise.all(
    chunks.map(async (item, index) => {
      //onst embedding = await getOpenAIEmbedding(item.text);
      return {
        ...item,
        chunkIndex: index + 1,
        totalChunks: chunks.length,
        prevChunkIndex: index > 0 ? index : null,
        nextChunkIndex: index < chunks.length - 1 ? index + 2 : null,
        sourceName: filename,
        sourceType: file.type,
        sourceSize: file.size.toString(),
        uploadDate: new Date().toISOString(),
        sourceNamespace: formNamespace,
      };
    }),
  );

  // 1. Construir el array de objetos a insertar
  const docsToInsert = enrichedChunks.map((item) => ({
    text: item.text,
    chunkIndex: item.chunkIndex,
    totalChunks: item.totalChunks,
    prevChunkIndex: item.prevChunkIndex,
    nextChunkIndex: item.nextChunkIndex,
    sourceName: item.sourceName,
    sourceType: item.sourceType,
    sourceSize: item.sourceSize,
    uploadDate: item.uploadDate,
    sourceNamespace: item.sourceNamespace,
    //embedding: item.embedding,
  }));

  // 2. Loguear el array completo
  console.log(
    "Docs a insertar en Weaviate:",
    JSON.stringify(docsToInsert, null, 2),
  );

  // 3. Intentar el insert y capturar errores
  try {
    await client.collections.get("DocumentChunk").data.insertMany(docsToInsert);
    console.log("Insert exitoso en Weaviate. Total:", docsToInsert.length);
  } catch (error) {
    console.error("Error al insertar en Weaviate:", error);
    throw error;
  }

  await fileColection.updateOne({_id: idUploadFile}, {$set: {status: 2}});
}

async function processDocument(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = await extractTextFromFile(buffer.buffer, file);

  // Divide el texto en chunks usando doble salto de línea como delimitador
  const chunks = text
    .trim()
    .split(/\n\n\n+/)
    .map((block) => {
      const match = block.match(
        /Pregunta:\s*([\s\S]*?)\n\s*Respuesta:\s*([\s\S]*?)$/i,
      );
      if (!match) {
        console.warn(`No se encontró un bloque válido en el texto: ${block}`);
        return null;
      }
      return {
        question: match[1].trim(),
        answer: match[2].trim(),
        text: `Pregunta: ${match[1].trim()}\nRespuesta: ${match[2].trim()}`,
      };
    })
    .filter(Boolean);

  console.log(
    `Archivo ${file.name} procesado. Total de chunks: ${chunks.length}`,
  );

  return {
    chunks,
    filename: file.name,
  };
}

export async function POST(req: NextRequest) {
  try {
    const {db} = await connectToDatabase();
    const fileColection = db.collection("file");

    const testMode = req.nextUrl.searchParams.get("test") === "true";
    const namespace = req.nextUrl.searchParams.get("namespace") || "default";
    const formData = await req.formData();
    let files = formData.getAll("file") as File[];

    if (!files || files.length === 0) {
      files = formData.getAll("files") as File[];
    }

    const formNamespace = (formData.get("namespace") as string) || namespace;

    if (!files || files.length === 0) {
      return NextResponse.json(
        {error: "No se proporcionaron archivos"},
        {status: 400},
      );
    }

    const className = "DocumentChunk";
    await ensureWeaviateClassExists(className);
    console.log(`Clase ${className} asegurada en Weaviate.`);

    const processedFiles = [];
    let totalChunks = 0;

    for (const file of files) {
      try {
        const {chunks: rawChunks, filename} = await processDocument(file);
        const chunks = await rawChunks.filter(
          (chunk): chunk is Chunk => chunk !== null,
        );
        console.log("chunks", chunks.length);
        totalChunks += chunks.length;

        if (testMode) {
          processedFiles.push({
            filename,
            size: file.size,
            type: file.type,
            chunks: chunks.length,
          });
          continue;
        }

        // Aquí se guarda el archivo en MongoDB
        const idUploadFile = await fileColection.insertOne({
          filename,
          size: file.size,
          type: file.type,
          chunks: chunks.length,
          vectorsUploaded: chunks.length,
          namespace: formNamespace,
          uploadDate: new Date(),
          status: 1,
        });

        // Aquí se suben los datos a Weaviate
        await insertDataToWeaviate(
          chunks,
          filename,
          file,
          formNamespace,
          idUploadFile.insertedId,
        );

        processedFiles.push({
          filename,
          size: file.size,
          type: file.type,
          chunks: chunks.length,
          vectorsUploaded: chunks.length,
          namespace: formNamespace,
        });
      } catch (error) {
        console.error(`Error procesando ${file.name}:`, error);
        processedFiles.push({
          filename: file.name,
          error: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `${files.length} archivos procesados. Total de chunks: ${totalChunks}.`,
      processedFiles,
    });
  } catch (error) {
    console.error("Error general:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error al procesar",
      },
      {status: 500},
    );
  }
}
