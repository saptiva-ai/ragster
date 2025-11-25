import {NextRequest, NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/mongodb/client";
import {DEFAULT_MODEL_SETTINGS} from "@/config/models";

// Default settings in case nothing exists in the database yet
const defaultSettings = {
  modelSettings: DEFAULT_MODEL_SETTINGS,
};

// GET para obtener configuraciones
export async function GET(req: NextRequest) {
  try {
    const {searchParams} = new URL(req.url);
    const key = searchParams.get("key");

    console.log(
      `Recibida solicitud para obtener configuración con clave "${key}"`,
    );

    if (!key) {
      console.error("Solicitud de configuración sin clave");
      return NextResponse.json(
        {
          success: false,
          error:
            'Se requiere un parámetro "key" para identificar la configuración',
        },
        {status: 400},
      );
    }

    // Conectar a MongoDB
    try {
      const {db} = await connectToDatabase();
      const settingsCollection = db.collection("settings");

      // Buscar la configuración por clave
      const settings = await settingsCollection.findOne({key});

      if (!settings) {
        console.log(`No se encontró configuración con clave "${key}"`);
        // Si no existe, devolver la configuración por defecto si es modelSettings
        if (key === "modelSettings") {
          console.log(`Devolviendo configuración por defecto para "${key}"`);
          return NextResponse.json({
            success: true,
            data: defaultSettings.modelSettings,
          });
        }

        return NextResponse.json(
          {
            success: false,
            error: `No se encontró configuración con la clave "${key}"`,
          },
          {status: 404},
        );
      }

      console.log(`Configuración "${key}" encontrada`);
      return NextResponse.json({
        success: true,
        data: settings.data,
      });
    } catch (dbError) {
      console.error("Error de conexión a MongoDB:", dbError);
      return NextResponse.json(
        {
          success: false,
          error: "Error de conexión a la base de datos",
          details:
            dbError instanceof Error ? dbError.message : "Error desconocido",
        },
        {status: 500},
      );
    }
  } catch (error) {
    console.error("Error al obtener configuración:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al obtener la configuración",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      {status: 500},
    );
  }
}

// POST para guardar configuraciones
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {key, data} = body;

    console.log(
      `Recibida solicitud para guardar configuración "${key}":`,
      data,
    );

    if (!key || !data) {
      console.error("Solicitud de guardado incompleta:", body);
      return NextResponse.json(
        {
          success: false,
          error:
            'Se requiere una clave "key" y datos "data" para guardar la configuración',
        },
        {status: 400},
      );
    }

    // Conectar a MongoDB
    try {
      const {db} = await connectToDatabase();
      const settingsCollection = db.collection("settings");

      // Actualizar o insertar la configuración
      const result = await settingsCollection.updateOne(
        {key},
        {$set: {key, data, updatedAt: new Date()}},
        {upsert: true},
      );

      console.log(`Configuración guardada para "${key}" en MongoDB:`, {
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
        upsertedId: result.upsertedId,
      });

      return NextResponse.json({
        success: true,
        message: "Configuración guardada exitosamente en la base de datos",
        result: {
          modified: result.modifiedCount,
          upserted: result.upsertedCount,
          key: key,
        },
      });
    } catch (dbError) {
      console.error("Error de conexión a MongoDB:", dbError);
      return NextResponse.json(
        {
          success: false,
          error: "Error de conexión a la base de datos",
          details:
            dbError instanceof Error ? dbError.message : "Error desconocido",
        },
        {status: 500},
      );
    }
  } catch (error) {
    console.error("Error al procesar la solicitud:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al procesar la solicitud",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      {status: 500},
    );
  }
}
