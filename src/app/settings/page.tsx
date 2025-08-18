"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

interface ModelSettingsData {
  modelId: string;
  temperature: number;
  systemPrompt: string;
}

interface WabaSettingsData {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  isEnabled: boolean;
}

interface NotificationState {
  success: string | null;
  error: string | null;
  visible: boolean;
}

export default function SettingsPage() {
  const [modelSettings, setModelSettings] = useState<ModelSettingsData>({
    modelId: "Qwen",
    temperature: 0.7,
    systemPrompt:
      "Eres un asistente AI que responde preguntas basándose en los documentos proporcionados. Utiliza solo la información de las fuentes para responder. Si la respuesta no está en los documentos, dilo claramente.",
  });

  const [wabaSettings, setWabaSettings] = useState<WabaSettingsData>({
    phoneNumberId: "",
    businessAccountId: "",
    accessToken: "",
    isEnabled: false,
  });

  const [notification, setNotification] = useState<NotificationState>({
    success: null,
    error: null,
    visible: false,
  });

  const [isLoading, setIsLoading] = useState(false);

  // Mostrar notificaciones
  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({
      success: type === "success" ? message : null,
      error: type === "error" ? message : null,
      visible: true,
    });

    // Ocultar notificación después de 5 segundos
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, visible: false }));
    }, 5000);
  };

  // Obtener configuraciones guardadas al cargar
  useEffect(() => {
    fetchSettings();
  }, []);

  // Cargar configuraciones desde el servidor
  const fetchSettings = async () => {
    setIsLoading(true);

    try {
      // Cargar configuraciones de API
      const apiResponse = await fetch("/api/settings?key=apiSettings");
      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        if (apiData.success && apiData.data) {
          console.log("Configuraciones de API:", apiData.data);
        }
      }

      // Cargar configuraciones del modelo
      const modelResponse = await fetch("/api/settings?key=modelSettings");
      if (modelResponse.ok) {
        const modelData = await modelResponse.json();
        if (modelData.success && modelData.data) {
          setModelSettings(modelData.data);
        }
      }

      // Cargar configuraciones de WABA
      const wabaResponse = await fetch("/api/settings?key=wabaSettings");
      if (wabaResponse.ok) {
        const wabaData = await wabaResponse.json();
        if (wabaData.success && wabaData.data) {
          setWabaSettings(wabaData.data);
        }
      }
    } catch (error) {
      console.error("Error al cargar configuraciones:", error);
      showNotification("error", "No se pudieron cargar las configuraciones");
    } finally {
      setIsLoading(false);
    }
  };

  // Manejar cambios en la configuración del modelo
  const handleModelChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;

    setModelSettings((prev) => ({
      ...prev,
      [name]: name === "temperature" ? parseFloat(value) : value,
    }));
  };

  // Manejar cambios en la configuración de WABA
  const handleWabaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setWabaSettings((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Guardar configuraciones del modelo
  const handleSaveModelSettings = async () => {
    setIsLoading(true);

    console.log("Guardando configuraciones del modelo:", modelSettings);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: "modelSettings",
          data: modelSettings,
        }),
      });

      if (response.ok) {
        showNotification(
          "success",
          "Configuración del modelo guardada correctamente",
        );

        // Emitir evento para actualizar otros componentes
        window.dispatchEvent(
          new CustomEvent("settingsChanged", {
            detail: modelSettings,
          }),
        );

        // Actualizar localStorage para compatibilidad
        localStorage.setItem("modelSettings", JSON.stringify(modelSettings));
      } else {
        const error = await response.json();
        throw new Error(error.error || "Error al guardar configuración");
      }
    } catch (error) {
      console.error("Error al guardar configuración del modelo:", error);
      showNotification(
        "error",
        error instanceof Error ? error.message : "Error desconocido",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Guardar configuraciones de WABA
  const handleSaveWabaSettings = async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: "wabaSettings",
          data: wabaSettings,
        }),
      });

      if (response.ok) {
        showNotification(
          "success",
          "Configuración de WhatsApp Business guardada correctamente",
        );
      } else {
        const error = await response.json();
        throw new Error(error.error || "Error al guardar configuración");
      }
    } catch (error) {
      console.error("Error al guardar configuración de WABA:", error);
      showNotification(
        "error",
        error instanceof Error ? error.message : "Error desconocido",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="flex items-center mb-6">
        <Link href="/" className="text-[#01f6d2] hover:text-teal-600 mr-2">
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-[#01f6d2]">Configuración</h1>
      </div>

      {/* Notificación */}
      {notification.visible && (
        <div
          className={`p-4 mb-6 rounded-md ${notification.success
            ? "bg-green-50 text-green-800"
            : "bg-red-50 text-red-800"
            }`}
        >
          {notification.success || notification.error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Configuración del API 
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
            <h2 className="text-xl font-semibold mb-4 text-[#01f6d2]">Configuración del API</h2>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="pineconeApiKey" className="block text-sm font-medium text-black">
                  Pinecone API Key
                </label>
                <input
                  type="password"
                  id="pineconeApiKey"
                  name="pineconeApiKey"
                  value={apiSettings.pineconeApiKey}
                  onChange={handleApiChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-[#01f6d2] focus:border-[#01f6d2] sm:text-sm placeholder-gray-600"
                  placeholder="sk-..."
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pinecone Index
                  </label>
                  <input
                    type="text"
                    name="pineconeIndex"
                    value={apiSettings.pineconeIndex}
                    onChange={handleApiChange}
                    className="w-full p-2 border border-gray-300 rounded-md placeholder-gray-600"
                    placeholder="ragster"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pinecone Environment
                  </label>
                  <input
                    type="text"
                    name="pineconeEnvironment"
                    value={apiSettings.pineconeEnvironment}
                    onChange={handleApiChange}
                    className="w-full p-2 border border-gray-300 rounded-md placeholder-gray-600"
                    placeholder="us-east-1"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pinecone Host
                </label>
                <input
                  type="text"
                  name="pineconeHost"
                  value={apiSettings.pineconeHost}
                  onChange={handleApiChange}
                  className="w-full p-2 border border-gray-300 rounded-md placeholder-gray-600"
                  placeholder="https://ragster-xxxx.svc.example.pinecone.io"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Embedding Model
                  </label>
                  <input
                    type="text"
                    name="pineconeModel"
                    value={apiSettings.pineconeModel}
                    onChange={handleApiChange}
                    className="w-full p-2 border border-gray-300 rounded-md placeholder-gray-600"
                    placeholder="multilingual-e5-large"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Model Dimensions
                  </label>
                  <input
                    type="text"
                    name="pineconeModelDimensions"
                    value={apiSettings.pineconeModelDimensions}
                    onChange={handleApiChange}
                    className="w-full p-2 border border-gray-300 rounded-md placeholder-gray-700"
                    placeholder="1024"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Saptiva API Key
                </label>
                <input
                  type="password"
                  name="saptivaApiKey"
                  value={apiSettings.saptivaApiKey}
                  onChange={handleApiChange}
                  className="w-full p-2 border border-gray-300 rounded-md placeholder-gray-700"
                  placeholder="va-ai-..."
                />
              </div>
              
              <button
                onClick={handleSaveApiSettings}
                disabled={isLoading}
                className={`px-4 py-2 rounded-md ${
                  isLoading
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-[#01f6d2] hover:bg-teal-500 text-black'
                }`}
              >
                {isLoading ? 'Guardando...' : 'Guardar configuración API'}
              </button>
            </div>
          </div>*/}
        <div className="col-span-3 md:col-span-2">
          {/* Configuración de WhatsApp Business */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4 text-[#01f6d2]">
              Configuración de WhatsApp Business API
            </h2>

            <div className="space-y-4">
              <div className="flex items-center mb-4">
                <input
                  type="checkbox"
                  id="isEnabled"
                  name="isEnabled"
                  checked={wabaSettings.isEnabled}
                  onChange={handleWabaChange}
                  className="h-4 w-4 text-[#01f6d2] rounded border-gray-300 focus:ring-[#01f6d2]"
                />
                <label
                  htmlFor="isEnabled"
                  className="ml-2 block text-sm text-black"
                >
                  Habilitar integración con WhatsApp
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID de número de teléfono
                </label>
                <input
                  type="text"
                  name="phoneNumberId"
                  value={wabaSettings.phoneNumberId}
                  onChange={handleWabaChange}
                  className="w-full p-2 border border-gray-300 rounded-md placeholder-gray-700"
                  placeholder="123456789012345"
                  disabled={!wabaSettings.isEnabled}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Identificador único del número de teléfono de WhatsApp
                  Business
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID de cuenta de WhatsApp Business
                </label>
                <input
                  type="text"
                  name="businessAccountId"
                  value={wabaSettings.businessAccountId}
                  onChange={handleWabaChange}
                  className="w-full p-2 border border-gray-300 rounded-md placeholder-gray-700"
                  placeholder="123456789"
                  disabled={!wabaSettings.isEnabled}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Identificador de tu cuenta de WhatsApp Business
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token de acceso
                </label>
                <input
                  type="password"
                  name="accessToken"
                  value={wabaSettings.accessToken}
                  onChange={handleWabaChange}
                  className="w-full p-2 border border-gray-300 rounded-md placeholder-gray-700"
                  placeholder="EAABx..."
                  disabled={!wabaSettings.isEnabled}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Token de acceso permanente generado en Facebook Developer
                </p>
              </div>

              <button
                onClick={handleSaveWabaSettings}
                disabled={isLoading || !wabaSettings.isEnabled}
                className={`px-4 py-2 rounded-md ${isLoading || !wabaSettings.isEnabled
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-[#01f6d2] hover:bg-teal-500 text-black"
                  }`}
              >
                {isLoading ? "Guardando..." : "Guardar configuración WhatsApp"}
              </button>
            </div>
          </div>
        </div>

        {/* Configuración del modelo LLM */}
        <div className="col-span-3 md:col-span-1">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4 text-[#01f6d2]">
              Configuración del Modelo
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Modelo
                </label>
                <select
                  name="modelId"
                  value={modelSettings.modelId}
                  onChange={handleModelChange}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >

                  <option value="Saptiva Turbo">Saptiva Turbo</option>
                  <option value="Saptiva Cortex">Saptiva Cortex</option>
                  <option value="Saptiva Ops">Saptiva Ops</option>
                  <option value="Qwen">Qwen</option>
                  <option value="LLaMa3.3 70B">LLaMa3.3 70B</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Temperatura: {modelSettings.temperature}
                </label>
                <input
                  type="range"
                  name="temperature"
                  min="0"
                  max="1"
                  step="0.1"
                  value={modelSettings.temperature}
                  onChange={handleModelChange}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prompt del sistema
                </label>
                <textarea
                  name="systemPrompt"
                  value={modelSettings.systemPrompt}
                  onChange={handleModelChange}
                  rows={4}
                  className="w-full p-2 border border-gray-300 rounded-md"
                ></textarea>
              </div>

              <button
                onClick={handleSaveModelSettings}
                disabled={isLoading}
                className={`px-4 py-2 rounded-md ${isLoading
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-[#01f6d2] hover:bg-teal-500 text-black"
                  }`}
              >
                {isLoading ? "Guardando..." : "Guardar configuración modelo"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
