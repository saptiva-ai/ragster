"use client";

import { useState } from "react";
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
      body: JSON.stringify({ key, data }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(
        `Error al guardar configuración (${response.status}):`,
        result
      );
      throw new Error(
        result.error ||
          `Error HTTP ${response.status} al guardar configuración`
      );
    }

    if (!result.success) {
      console.error("La API indicó un error al guardar configuración:", result);
      throw new Error(
        result.error || "Error desconocido al guardar configuración"
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
  const [settings, setSettings] = useState<ApiSettings>(apiSettings);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const newSettings = { ...settings, [name]: value };
    setSettings(newSettings);
    onApiSettingsChange(newSettings);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Por favor, sube solo archivos de imagen.");
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert("La imagen es demasiado grande. El tamaño máximo es 5MB.");
      return;
    }

    const logoContainer = document.querySelector(".logoContainer");
    if (logoContainer) {
      logoContainer.classList.add("opacity-50");
    }

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const imageUrl = e.target?.result as string;
        const newSettings = { ...settings, logoUrl: imageUrl };
        setSettings(newSettings);
        onApiSettingsChange(newSettings);

        try {
          await saveSettingToMongo("logo", { logoUrl: imageUrl });
          localStorage.setItem("logo", imageUrl);
          console.log("Logo guardado correctamente en MongoDB y localStorage");
        } catch (saveError) {
          console.error("Error al guardar el logo:", saveError);
          alert(
            `No se pudo guardar el logo: ${
              saveError instanceof Error
                ? saveError.message
                : "Error desconocido"
            }`
          );
        }
      } catch (error) {
        console.error("Error al procesar la imagen:", error);
        alert(
          "No se pudo procesar la imagen. Por favor, intenta con otra imagen."
        );
      } finally {
        if (logoContainer) {
          logoContainer.classList.remove("opacity-50");
        }
      }
    };

    reader.onerror = () => {
      alert("Error al leer el archivo. Por favor, intenta de nuevo.");
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
          {/* Logo */}
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

          {/* Saptiva */}
          <div className="p-4 space-y-4 bg-white">
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
                API Key para acceder a la API de Saptiva. Comienza con va-ai-
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
