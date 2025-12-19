"use client";

import { useState, useEffect, useCallback } from "react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { DEFAULT_MODEL_SETTINGS, CHAT_MODELS } from "@/config/models";

// Generar un UUID v4 estándar
function generateId(): string {
  return crypto.randomUUID();
}

// Función para generar timestamp legible
const generateTimestampString = (): string => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-MX', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  });
  const timeStr = now.toLocaleTimeString('es-MX', { 
    hour: '2-digit', 
    minute: '2-digit'
  });
  return `${dateStr} ${timeStr}`;
};

interface ModelSettingsData {
  modelId: string;
  temperature: number;
  systemPrompt: string;
}

interface PromptHistoryItem {
  id: string;
  prompt: string;
  createdAt: string;
  name?: string;
}

interface ModelSettingsProps {
  onSave?: (settings: ModelSettingsData) => void;
  onError?: (error: string) => void;
  compact?: boolean;
}

export default function ModelSettings({ 
  onSave, 
  onError,
  compact = false 
}: ModelSettingsProps) {
  const [modelSettings, setModelSettings] = useState<ModelSettingsData>({
    modelId: DEFAULT_MODEL_SETTINGS.modelId,
    temperature: DEFAULT_MODEL_SETTINGS.temperature,
    systemPrompt: DEFAULT_MODEL_SETTINGS.systemPrompt,
  });

  const [promptHistory, setPromptHistory] = useState<PromptHistoryItem[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>("");
  const [promptName, setPromptName] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar configuraciones
  const fetchSettings = useCallback(async () => {
    try {
      // Cargar configuración del modelo
      const response = await fetch("/api/settings?key=modelSettings");
      let loadedSettings: ModelSettingsData | null = null;
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          loadedSettings = data.data;
          setModelSettings(data.data);
        }
      } else {
        // Fallback a localStorage
        const storedSettings = localStorage.getItem("modelSettings");
        if (storedSettings) {
          const parsed = JSON.parse(storedSettings);
          loadedSettings = parsed;
          setModelSettings(parsed);
        }
      }

      // Si no hay settings cargados, usar los valores por defecto
      if (!loadedSettings) {
        loadedSettings = {
          modelId: DEFAULT_MODEL_SETTINGS.modelId,
          temperature: DEFAULT_MODEL_SETTINGS.temperature,
          systemPrompt: DEFAULT_MODEL_SETTINGS.systemPrompt,
        };
        setModelSettings(loadedSettings);
      }

      // Cargar historial de prompts
      const historyResponse = await fetch("/api/settings?key=promptHistory");
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        if (historyData.success && historyData.data && Array.isArray(historyData.data) && historyData.data.length > 0) {
          setPromptHistory(historyData.data);
          
          // Seleccionar automáticamente el último guardado (el primero del array)
          const lastPrompt = historyData.data[0]; // El primero es el más reciente
          setSelectedHistoryId(lastPrompt.id);
          
          // Cargar el prompt del último guardado en el textarea
          setModelSettings((prev) => ({
            ...prev,
            systemPrompt: lastPrompt.prompt,
          }));
        } else {
          // Si no hay historial válido, inicializar como array vacío
          setPromptHistory([]);
          setSelectedHistoryId("");
        }
      } else {
        // Si falla la carga del historial, inicializar como array vacío
        setPromptHistory([]);
        setSelectedHistoryId("");
      }
      
      // El campo de nombre siempre debe estar vacío para permitir modificarlo
      setPromptName("");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error desconocido";
      setError(errorMessage);
      if (onError) onError(errorMessage);
    }
  }, [onError]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Manejar cambios
  const handleModelChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setModelSettings((prev) => ({
      ...prev,
      [name]: name === "temperature" ? parseFloat(value) : value,
    }));
    if (name === "systemPrompt") {
      setSelectedHistoryId(""); // Limpiar selección cuando se edita manualmente
    }
  };

  // Seleccionar prompt del historial
  const handleSelectHistoryPrompt = (historyId: string) => {
    const selectedItem = promptHistory.find((item) => item.id === historyId);
    if (selectedItem) {
      setModelSettings((prev) => ({
        ...prev,
        systemPrompt: selectedItem.prompt,
      }));
      setSelectedHistoryId(historyId);
      setPromptName("");
    }
  };

  // Eliminar prompt del historial
  const handleDeletePrompt = async (promptId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este prompt del historial?")) {
      return;
    }

    const deletedPrompt = promptHistory.find((item) => item.id === promptId);
    const updatedHistory = promptHistory.filter((item) => item.id !== promptId);

    // Si se borró el último prompt
    if (updatedHistory.length === 0) {
      setSelectedHistoryId("");
      setPromptHistory([]);
      setModelSettings((prev) => ({
        ...prev,
        systemPrompt: DEFAULT_MODEL_SETTINGS.systemPrompt,
      }));

      try {
        // Eliminar historial de la API
        await fetch("/api/settings?key=promptHistory", {
          method: "DELETE",
        });

        // Guardar configuración con prompt por defecto
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: "modelSettings",
            data: {
              ...modelSettings,
              systemPrompt: DEFAULT_MODEL_SETTINGS.systemPrompt,
            },
          }),
        });

        setPromptName("");
        await fetchSettings();
      } catch (err) {
        console.error("Error al eliminar último prompt:", err);
        setPromptHistory(promptHistory);
      }
      return;
    }

    // Si aún hay prompts
    if (selectedHistoryId === promptId) {
      setSelectedHistoryId("");
      if (deletedPrompt && modelSettings.systemPrompt.trim() === deletedPrompt.prompt.trim()) {
        setModelSettings((prev) => ({
          ...prev,
          systemPrompt: DEFAULT_MODEL_SETTINGS.systemPrompt,
        }));
      }
    }

    setPromptHistory(updatedHistory);

    try {
      // Guardar historial actualizado
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "promptHistory",
          data: updatedHistory,
        }),
      });

      setPromptName("");
      await fetchSettings();
    } catch (err) {
      console.error("Error al eliminar prompt:", err);
      setPromptHistory(promptHistory);
    }
  };

  // Guardar configuración del modelo y actualizar historial (siempre guarda, reescribe si es duplicado)
  const handleSaveSettings = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Validar que el prompt no esté vacío
      if (!modelSettings.systemPrompt.trim()) {
        const errorMsg = "El prompt no puede estar vacío";
        setError(errorMsg);
        if (onError) onError(errorMsg);
        setIsSaving(false);
        return;
      }

      // Asegurar que promptHistory es un array
      const currentHistory = Array.isArray(promptHistory) ? promptHistory : [];

      // Buscar si el prompt ya existe en el historial
      const existingIndex = currentHistory.findIndex(
        (item) => item.prompt.trim() === modelSettings.systemPrompt.trim()
      );

      let updatedHistory = [...currentHistory];
      const timestamp = generateTimestampString();
      const promptNameToUse = promptName.trim()
        ? `${promptName.trim()} - ${timestamp}`
        : `Prompt ${timestamp}`;

      let newItemId: string;

      if (existingIndex !== -1) {
        // Si existe, actualizar el existente (reescribir con nueva fecha/nombre)
        newItemId = currentHistory[existingIndex].id;
        updatedHistory[existingIndex] = {
          ...currentHistory[existingIndex],
          name: promptNameToUse,
          createdAt: new Date().toISOString(),
        };
        // Mover al inicio del array
        const [updated] = updatedHistory.splice(existingIndex, 1);
        updatedHistory = [updated, ...updatedHistory];
      } else {
        // Si no existe, crear nuevo
        newItemId = generateId();
        const newHistoryItem: PromptHistoryItem = {
          id: newItemId,
          prompt: modelSettings.systemPrompt,
          createdAt: new Date().toISOString(),
          name: promptNameToUse,
        };
        updatedHistory = [newHistoryItem, ...updatedHistory].slice(0, 20);
      }

      setPromptHistory(updatedHistory);
      setSelectedHistoryId(newItemId);
      setPromptName("");

      // Guardar historial en la API
      try {
        const historyResponse = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: "promptHistory",
            data: updatedHistory,
          }),
        });

        if (!historyResponse.ok) {
          console.error("Error al guardar historial, pero continuando con la configuración");
        }
      } catch (historyError) {
        console.error("Error al guardar historial:", historyError);
      }

      // Guardar configuración del modelo (siempre, incluso si solo cambió modelo/temperatura)
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "modelSettings",
          data: modelSettings,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al guardar en la API");
      }

      // Guardar en localStorage como fallback
      localStorage.setItem("modelSettings", JSON.stringify(modelSettings));

      // Emitir evento global
      window.dispatchEvent(
        new CustomEvent("settingsChanged", { detail: modelSettings })
      );

      // Callback opcional
      if (onSave) onSave(modelSettings);

      // Recargar con manejo de errores
      try {
        await fetchSettings();
      } catch (reloadError) {
        console.error("Error al recargar configuraciones:", reloadError);
        // No lanzar error aquí, ya se guardó correctamente
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error desconocido";
      setError(errorMessage);
      if (onError) onError(errorMessage);
    } finally {
      // Asegurar que siempre se desactive el estado de guardado
      setIsSaving(false);
    }
  };

  const containerClass = compact 
    ? "bg-white p-6 rounded-lg shadow-md"
    : "max-w-5xl mx-auto";

  const headerClass = compact
    ? "text-xl font-semibold mb-4 text-[#01f6d2]"
    : "text-lg font-medium text-gray-900";

  return (
    <div className={containerClass}>
      {!compact ? (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <h2 className={headerClass}>Configuración del Modelo</h2>
            <p className="mt-1 text-sm text-black">
              Ajusta el modelo, temperatura y sistema de instrucciones
            </p>
          </div>
          <div className="p-6 space-y-6">
            {error && (
              <div className="p-4 mb-4 bg-red-50 border border-red-200 text-red-800 rounded-md">
                {error}
              </div>
            )}

            {/* Modelo */}
            <div>
              <label className="block text-sm font-bold text-black mb-2">
                Modelo
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CHAT_MODELS.map((model) => (
                  <div key={model.id} className="relative">
                    <input
                      type="radio"
                      id={model.id}
                      name="model"
                      value={model.id}
                      checked={modelSettings.modelId === model.id}
                      onChange={() => setModelSettings(prev => ({ ...prev, modelId: model.id }))}
                      className="peer absolute opacity-0 w-0 h-0"
                    />
                    <label
                      htmlFor={model.id}
                      className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50 peer-checked:border-[#01f6d2] peer-checked:bg-[#e6fefb]"
                    >
                      <div className="flex-1">
                        <div className="text-base font-bold text-black">{model.name}</div>
                        <div className="text-xs text-black font-medium mt-1">Saptiva</div>
                      </div>
                      <div className="h-5 w-5 rounded-full border border-gray-300 flex items-center justify-center peer-checked:border-[#01f6d2] peer-checked:bg-[#01f6d2]">
                        {modelSettings.modelId === model.id && (
                          <div className="h-3 w-3 rounded-full bg-white"></div>
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Temperatura */}
            <div>
              <label htmlFor="temperature" className="block text-sm font-bold text-black mb-2">
                Temperatura: {modelSettings.temperature.toFixed(1)}
              </label>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-black">0.0</span>
                <input
                  id="temperature"
                  type="range"
                  name="temperature"
                  min="0"
                  max="1"
                  step="0.1"
                  value={modelSettings.temperature}
                  onChange={handleModelChange}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #01f6d2 0%, #01f6d2 ${
                      modelSettings.temperature * 100
                    }%, #e5e7eb ${modelSettings.temperature * 100}%, #e5e7eb 100%)`,
                  }}
                />
                <span className="text-sm text-black">1.0</span>
              </div>
              <div className="text-xs text-black mt-2 grid grid-cols-2">
                <span>Más preciso y determinista</span>
                <span className="text-right">Más creativo y variable</span>
              </div>
            </div>

            {/* Prompt del sistema con historial */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prompt del sistema
              </label>

              {/* Selector de historial */}
              <div className="mb-3">
                <label htmlFor="prompt-history" className="block text-xs font-medium text-gray-600 mb-1">
                  Historial de Prompts Guardados
                </label>
                <div className="relative">
                  <select
                    id="prompt-history"
                    value={selectedHistoryId}
                    onChange={(e) => {
                      if (e.target.value) {
                        handleSelectHistoryPrompt(e.target.value);
                      } else {
                        setSelectedHistoryId("");
                      }
                    }}
                    disabled={promptHistory.length === 0}
                    className="w-full p-2 pr-10 border border-gray-300 rounded-md text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 appearance-none"
                  >
                    <option value="" disabled>
                      {promptHistory.length === 0
                        ? "-- No hay prompts en el historial. Crea y guarda un prompt para comenzar --"
                        : "-- Seleccionar prompt del historial --"}
                    </option>
                    {promptHistory.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || `Prompt ${new Date(item.createdAt).toLocaleDateString('es-MX')}`}
                      </option>
                    ))}
                  </select>

                  {/* Botón de eliminar */}
                  {selectedHistoryId && promptHistory.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeletePrompt(selectedHistoryId);
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors z-10"
                      title="Eliminar prompt seleccionado"
                      type="button"
                      disabled={isSaving}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Campo para nombrar el prompt */}
              <div className="mb-3">
                <label htmlFor="prompt-name" className="block text-xs font-medium text-gray-600 mb-1">
                  Nombre para Guardar este Prompt
                </label>
                <input
                  id="prompt-name"
                  type="text"
                  value={promptName}
                  onChange={(e) => setPromptName(e.target.value)}
                  placeholder="Ej: Prompt V1"
                  className="w-full p-2 border border-gray-300 rounded-md text-sm"
                />
              </div>

              <textarea
                name="systemPrompt"
                value={modelSettings.systemPrompt}
                onChange={handleModelChange}
                rows={4}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>

            {/* Botón guardar configuración */}
            <div className="pt-4">
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="w-full md:w-auto px-4 py-2 bg-[#01f6d2] text-white font-medium rounded-lg hover:bg-[#00d9b9] focus:outline-none focus:ring-2 focus:ring-[#01f6d2] focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSaving ? "Guardando..." : "Guardar Configuración"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <h2 className={headerClass}>Configuración del Modelo</h2>
          {error && (
            <div className="p-4 mb-4 bg-red-50 border border-red-200 text-red-800 rounded-md text-sm">
              {error}
            </div>
          )}
          <div className="space-y-4">
            {/* Modelo */}
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

            {/* Temperatura */}
            <div>
              <label htmlFor="temperature" className="block text-sm font-medium text-gray-700 mb-1">
                Temperatura: {modelSettings.temperature.toFixed(1)}
              </label>
              <input
                id="temperature"
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

            {/* Prompt del sistema con historial */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prompt del sistema
              </label>

              {/* Selector de historial */}
              <div className="mb-3">
                <label htmlFor="prompt-history" className="block text-xs font-medium text-gray-600 mb-1">
                  Historial de Prompts Guardados
                </label>
                <div className="relative">
                  <select
                    id="prompt-history"
                    value={selectedHistoryId}
                    onChange={(e) => {
                      if (e.target.value) {
                        handleSelectHistoryPrompt(e.target.value);
                      } else {
                        setSelectedHistoryId("");
                      }
                    }}
                    disabled={promptHistory.length === 0}
                    className="w-full p-2 pr-10 border border-gray-300 rounded-md text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 appearance-none"
                  >
                    <option value="" disabled>
                      {promptHistory.length === 0
                        ? "-- No hay prompts en el historial. Crea y guarda un prompt para comenzar --"
                        : "-- Seleccionar prompt del historial --"}
                    </option>
                    {promptHistory.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || `Prompt ${new Date(item.createdAt).toLocaleDateString('es-MX')}`}
                      </option>
                    ))}
                  </select>

                  {/* Botón de eliminar */}
                  {selectedHistoryId && promptHistory.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeletePrompt(selectedHistoryId);
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors z-10"
                      title="Eliminar prompt seleccionado"
                      type="button"
                      disabled={isSaving}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Campo para nombrar el prompt */}
              <div className="mb-3">
                <label htmlFor="prompt-name" className="block text-xs font-medium text-gray-600 mb-1">
                  Nombre para Guardar este Prompt
                </label>
                <input
                  id="prompt-name"
                  type="text"
                  value={promptName}
                  onChange={(e) => setPromptName(e.target.value)}
                  placeholder="Ej: Prompt V1"
                  className="w-full p-2 border border-gray-300 rounded-md text-sm"
                />
              </div>

              <textarea
                name="systemPrompt"
                value={modelSettings.systemPrompt}
                onChange={handleModelChange}
                rows={4}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>

            {/* Botón guardar configuración */}
            <div>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="w-full px-4 py-2 bg-[#01f6d2] text-white font-medium rounded-lg hover:bg-[#00d9b9] focus:outline-none focus:ring-2 focus:ring-[#01f6d2] focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSaving ? "Guardando..." : "Guardar Configuración"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
