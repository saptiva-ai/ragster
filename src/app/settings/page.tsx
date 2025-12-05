"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import ModelSettings from "@/components/ModelSettings";

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

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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

  // Cargar todas las configuraciones
  const fetchAllSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      // Cargar configuraciones de WABA
      const wabaResponse = await fetch("/api/settings?key=wabaSettings");
      if (wabaResponse.ok) {
        const wabaData = await wabaResponse.json();
        if (wabaData.success && wabaData.data) {
          setWabaSettings(wabaData.data);
        }
      }

      // API settings (solo para log, no se usa)
      const apiResponse = await fetch("/api/settings?key=apiSettings");
      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        if (apiData.success && apiData.data) {
          console.log("Configuraciones de API:", apiData.data);
        }
      }
    } catch (error) {
      console.error("Error al cargar configuraciones:", error);
      showNotification("error", "No se pudieron cargar las configuraciones");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllSettings();
  }, [fetchAllSettings]);

  // Manejar cambios en la configuración de WABA
  const handleWabaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setWabaSettings((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Guardar configuraciones de WABA
  const handleSaveWabaSettings = async () => {
    // Validar campos requeridos
    if (
      !wabaSettings.phoneNumberId ||
      !wabaSettings.businessAccountId ||
      !wabaSettings.accessToken
    ) {
      showNotification("error", "Todos los campos son requeridos");
      return;
    }

    // Validación adicional: eliminar espacios en blanco
    if (
      wabaSettings.phoneNumberId.trim() === "" ||
      wabaSettings.businessAccountId.trim() === "" ||
      wabaSettings.accessToken.trim() === ""
    ) {
      showNotification("error", "Los campos no pueden estar vacíos");
      return;
    }

    setIsSaving(true);
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
          "Configuración de WhatsApp Business guardada correctamente"
        );
        await fetchAllSettings();
      } else {
        const error = await response.json();
        throw new Error(error.error || "Error al guardar configuración");
      }
    } catch (error) {
      showNotification(
        "error",
        error instanceof Error ? error.message : "Error desconocido"
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Callbacks para ModelSettings
  const handleModelSave = () => {
    showNotification("success", "Configuración del modelo guardada correctamente");
  };

  const handleModelError = (error: string) => {
    showNotification("error", error);
  };

  // Loading inicial de la página
  if (isLoading) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center mb-6">
          <Link href="/" className="text-[#01f6d2] hover:text-teal-600 mr-2">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-[#01f6d2]">Configuración</h1>
        </div>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#01f6d2]"></div>
          <span className="ml-3 text-lg text-gray-700">
            Cargando configuraciones...
          </span>
        </div>
      </main>
    );
  }

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
                disabled={isSaving || !wabaSettings.isEnabled}
                className={`px-4 py-2 rounded-md ${
                  isSaving || !wabaSettings.isEnabled
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-[#01f6d2] hover:bg-teal-500 text-black"
                }`}
              >
                {isSaving ? "Guardando..." : "Guardar configuración WhatsApp"}
              </button>
            </div>
          </div>
        </div>

        {/* Configuración del modelo - usando componente */}
        <div className="col-span-3 md:col-span-1">
          <ModelSettings 
            onSave={handleModelSave} 
            onError={handleModelError}
            compact={true}
          />
        </div>
      </div>
    </main>
  );
}
