"use client";

import {useState} from "react";
import Image from "next/image";

// Función auxiliar para guardar en MongoDB
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveSettingToMongo(key: string, data: any) {
  console.log(`Enviando solicitud para guardar "${key}" a MongoDB:`, data);

  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({key, data}),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(
        `Error al guardar configuración (${response.status}):`,
        result,
      );
      throw new Error(
        result.error ||
          `Error HTTP ${response.status} al guardar configuración`,
      );
    }

    if (!result.success) {
      console.error("La API indicó un error al guardar configuración:", result);
      throw new Error(
        result.error || "Error desconocido al guardar configuración",
      );
    }

    console.log(`Configuración "${key}" guardada con éxito:`, result);
    return result;
  } catch (error) {
    console.error(`Error al guardar configuración "${key}":`, error);
    throw error;
  }
}

type ApiSettings = {
  pineconeApiKey: string;
  pineconeIndex: string;
  pineconeEnvironment: string;
  pineconeHost: string;
  pineconeModel: string;
  pineconeModelDimensions: string;
  saptivaApiKey: string;
  logoUrl: string;
};

type ApiSettingsProps = {
  apiSettings: ApiSettings;
  onApiSettingsChange: (settings: ApiSettings) => void;
};

export default function ApiSettings({
  apiSettings,
  onApiSettingsChange,
}: ApiSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"vectordb" | "llm">("vectordb");
  const [settings, setSettings] = useState<ApiSettings>(apiSettings);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const {name, value} = e.target;
    const newSettings = {...settings, [name]: value};
    setSettings(newSettings);
    onApiSettingsChange(newSettings);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Verificar que sea una imagen
    if (!file.type.startsWith("image/")) {
      alert("Por favor, sube solo archivos de imagen.");
      return;
    }

    // Verificar tamaño (máximo 5MB)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      alert("La imagen es demasiado grande. El tamaño máximo es 5MB.");
      return;
    }

    // Mostrar estado de carga reduciendo la opacidad
    const logoContainer = document.querySelector(".logoContainer");
    if (logoContainer) {
      logoContainer.classList.add("opacity-50");
    }

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const imageUrl = e.target?.result as string;
        const newSettings = {...settings, logoUrl: imageUrl};
        setSettings(newSettings);
        onApiSettingsChange(newSettings);

        try {
          // Guardar en MongoDB
          await saveSettingToMongo("logo", {logoUrl: imageUrl});

          // También guardar en localStorage como respaldo
          localStorage.setItem("logo", imageUrl);
          console.log("Logo guardado correctamente en MongoDB y localStorage");
        } catch (saveError) {
          console.error("Error al guardar el logo:", saveError);
          alert(
            `No se pudo guardar el logo: ${
              saveError instanceof Error
                ? saveError.message
                : "Error desconocido"
            }`,
          );
        }
      } catch (error) {
        console.error("Error al procesar la imagen:", error);
        alert(
          "No se pudo procesar la imagen. Por favor, intenta con otra imagen.",
        );
      } finally {
        // Restaurar opacidad
        if (logoContainer) {
          logoContainer.classList.remove("opacity-50");
        }
      }
    };

    reader.onerror = () => {
      alert("Error al leer el archivo. Por favor, intenta de nuevo.");
      // Restaurar opacidad
      if (logoContainer) {
        logoContainer.classList.remove("opacity-50");
      }
    };

    reader.readAsDataURL(file);
  };

  return (
    <div className="w-full max-w-3xl mx-auto mb-6 border border-gray-200 rounded-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 text-left font-medium bg-white text-black hover:bg-gray-50 flex justify-between items-center"
      >
        <span>Configuración de API</span>
        <svg
          className={`w-5 h-5 transform transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200 bg-white">
          {/* Logo Upload Section */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-md font-medium text-black mb-2">
              Personalización
            </h3>
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 border border-gray-200 rounded-md flex items-center justify-center overflow-hidden logoContainer transition-opacity duration-300">
                {settings.logoUrl ? (
                  <Image
                    src={settings.logoUrl}
                    alt="Logo"
                    width={64}
                    height={64}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <span className="text-gray-400">Logo</span>
                )}
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Logo personalizado
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-slate-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-medium
                    file:bg-[#01f6d2] file:text-white
                    hover:file:bg-[#00d9b9]"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Recomendado: PNG con fondo transparente, 120x40px
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 bg-white">
            <button
              onClick={() => setActiveTab("vectordb")}
              className={`flex-1 py-3 px-4 text-sm font-medium ${
                activeTab === "vectordb"
                  ? "border-b-2 border-[#01f6d2] text-[#01f6d2] font-semibold bg-gray-50"
                  : "text-gray-600 bg-white hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              Base de datos vectorial
            </button>
            <button
              onClick={() => setActiveTab("llm")}
              className={`flex-1 py-3 px-4 text-sm font-medium ${
                activeTab === "llm"
                  ? "border-b-2 border-[#01f6d2] text-[#01f6d2] font-semibold bg-gray-50"
                  : "text-gray-600 bg-white hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              Modelo Saptiva
            </button>
          </div>

          {/* Content based on active tab */}
          <div className="p-4 space-y-4 bg-white">
            {activeTab === "vectordb" && (
              <>
                <div>
                  <label
                    htmlFor="pineconeApiKey"
                    className="block text-sm font-bold text-black mb-1"
                  >
                    Pinecone API Key
                  </label>
                  <input
                    type="password"
                    id="pineconeApiKey"
                    name="pineconeApiKey"
                    value={settings.pineconeApiKey}
                    onChange={handleChange}
                    placeholder="pcsk_..."
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-[#01f6d2] focus:border-[#01f6d2] text-gray-800"
                  />
                  <p className="mt-1 text-xs text-black">
                    API Key de tu cuenta de Pinecone (dashboard.pinecone.io)
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="pineconeIndex"
                    className="block text-sm font-bold text-black mb-1"
                  >
                    Nombre del Índice
                  </label>
                  <input
                    type="text"
                    id="pineconeIndex"
                    name="pineconeIndex"
                    value={settings.pineconeIndex}
                    onChange={handleChange}
                    placeholder="ragster"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-[#01f6d2] focus:border-[#01f6d2] text-gray-800"
                  />
                  <p className="mt-1 text-xs text-black">
                    Nombre del índice de Pinecone (Ej: ragster)
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="pineconeEnvironment"
                    className="block text-sm font-bold text-black mb-1"
                  >
                    Región
                  </label>
                  <input
                    type="text"
                    id="pineconeEnvironment"
                    name="pineconeEnvironment"
                    value={settings.pineconeEnvironment}
                    onChange={handleChange}
                    placeholder="us-east-1"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-[#01f6d2] focus:border-[#01f6d2] text-gray-800"
                  />
                  <p className="mt-1 text-xs text-black">
                    Región de AWS donde está tu índice (Ej: us-east-1)
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="pineconeHost"
                    className="block text-sm font-bold text-black mb-1"
                  >
                    Endpoint URL
                  </label>
                  <input
                    type="text"
                    id="pineconeHost"
                    name="pineconeHost"
                    value={settings.pineconeHost}
                    onChange={handleChange}
                    placeholder="https://ragster-xxxx.svc.xxxx.pinecone.io"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-[#01f6d2] focus:border-[#01f6d2] text-gray-800"
                  />
                  <p className="mt-1 text-xs text-black">
                    URL del host de Pinecone (se encuentra en la consola de
                    Pinecone)
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="pineconeModel"
                    className="block text-sm font-bold text-black mb-1"
                  >
                    Modelo de Embeddings
                  </label>
                  <input
                    type="text"
                    id="pineconeModel"
                    name="pineconeModel"
                    value={settings.pineconeModel}
                    onChange={handleChange}
                    placeholder="multilingual-e5-large"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-[#01f6d2] focus:border-[#01f6d2] text-gray-800"
                  />
                  <p className="mt-1 text-xs text-black">
                    Modelo usado para embeddings (por defecto:
                    multilingual-e5-large)
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="pineconeModelDimensions"
                    className="block text-sm font-bold text-black mb-1"
                  >
                    Dimensiones
                  </label>
                  <input
                    type="text"
                    id="pineconeModelDimensions"
                    name="pineconeModelDimensions"
                    value={settings.pineconeModelDimensions}
                    onChange={handleChange}
                    placeholder="1024"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-[#01f6d2] focus:border-[#01f6d2] text-gray-800"
                  />
                  <p className="mt-1 text-xs text-black">
                    Dimensiones del vector: 1024 para multilingual-e5-large
                  </p>
                </div>
              </>
            )}

            {activeTab === "llm" && (
              <>
                <div>
                  <label
                    htmlFor="saptivaApiKey"
                    className="block text-sm font-bold text-black mb-1"
                  >
                    Saptiva API Key
                  </label>
                  <input
                    type="password"
                    id="saptivaApiKey"
                    name="saptivaApiKey"
                    value={settings.saptivaApiKey}
                    onChange={handleChange}
                    placeholder="va-ai-..."
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-[#01f6d2] focus:border-[#01f6d2] text-gray-800"
                  />
                  <p className="mt-1 text-xs text-black">
                    API Key para acceder a la API de Saptiva. Comienza con
                    va-ai-
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
