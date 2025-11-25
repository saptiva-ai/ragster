"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import {DEFAULT_MODEL_SETTINGS, CHAT_MODELS} from "@/config/models";

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
    modelId: DEFAULT_MODEL_SETTINGS.modelId,
    temperature: DEFAULT_MODEL_SETTINGS.temperature,
    systemPrompt: DEFAULT_MODEL_SETTINGS.systemPrompt,
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

    setTimeout(() => {
      setNotification((prev) => ({ ...prev, visible: false }));
    }, 5000);
  };

  // 🔹 Cargar configuraciones desde el servidor (estable con useCallback)
  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      // API settings
      const apiResponse = await fetch("/api/settings?key=apiSettings");
      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        if (apiData.success && apiData.data) {
          console.log("Configuraciones de API:", apiData.data);
        }
      }

      // Model settings
      const modelResponse = await fetch("/api/settings?key=modelSettings");
      if (modelResponse.ok) {
        const modelData = await modelResponse.json();
        if (modelData.success && modelData.data) {
          setModelSettings(modelData.data);
        }
      }

      // WABA settings
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
  }, []);

  // 🔹 Llamar al cargar
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

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
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

        // Emitir evento global
        window.dispatchEvent(
          new CustomEvent("settingsChanged", { detail: modelSettings }),
        );

        // Guardar en localStorage
        localStorage.setItem("modelSettings", JSON.stringify(modelSettings));

        // 🔹 Recargar al momento
        fetchSettings();
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
    // Validar campos requeridos
    if (!wabaSettings.phoneNumberId || !wabaSettings.businessAccountId || !wabaSettings.accessToken) {
      showNotification(
        "error",
        "Todos los campos son requeridos"
      );
      return;
    }

    // Validación adicional: eliminar espacios en blanco
    if (
      wabaSettings.phoneNumberId.trim() === "" ||
      wabaSettings.businessAccountId.trim() === "" ||
      wabaSettings.accessToken.trim() === ""
    ) {
      showNotification(
        "error",
        "Los campos no pueden estar vacíos"
      );
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

        // 🔹 Recargar al momento
        fetchSettings();
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
          className={`p-4 mb-6 rounded-md ${
            notification.success
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {notification.success || notification.error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Configuración de WhatsApp Business */}
        <div className="col-span-3 md:col-span-2">
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
                <label htmlFor="isEnabled" className="ml-2 block text-sm text-black">
                  Habilitar integración con WhatsApp
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID de número de teléfono <span className="text-red-800">*</span>
                </label>
                <input
                  type="text"
                  name="phoneNumberId"
                  value={wabaSettings.phoneNumberId}
                  onChange={handleWabaChange}
                  className="w-full p-2 border border-gray-300 rounded-md placeholder-gray-700"
                  placeholder="123456789012345"
                  required
                  disabled={!wabaSettings.isEnabled}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID de cuenta de WhatsApp Business <span className="text-red-800">*</span>
                </label>
                <input
                  type="text"
                  name="businessAccountId"
                  value={wabaSettings.businessAccountId}
                  onChange={handleWabaChange}
                  className="w-full p-2 border border-gray-300 rounded-md placeholder-gray-700"
                  placeholder="123456789"
                  required
                  disabled={!wabaSettings.isEnabled}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token de acceso <span className="text-red-800">*</span>
                </label>
                <input
                  type="password"
                  name="accessToken"
                  value={wabaSettings.accessToken}
                  onChange={handleWabaChange}
                  className="w-full p-2 border border-gray-300 rounded-md placeholder-gray-700"
                  placeholder="EAABx..."
                  required
                  disabled={!wabaSettings.isEnabled}
                />
              </div>

              <button
                onClick={handleSaveWabaSettings}
                disabled={isLoading || !wabaSettings.isEnabled}
                className={`px-4 py-2 rounded-md ${
                  isLoading || !wabaSettings.isEnabled
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-[#01f6d2] hover:bg-teal-500 text-black"
                }`}
              >
                {isLoading ? "Guardando..." : "Guardar configuración WhatsApp"}
              </button>
            </div>
          </div>
        </div>

        {/* Configuración del modelo */}
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
                  {CHAT_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
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
                className={`px-4 py-2 rounded-md ${
                  isLoading
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
