"use client";

import { useState, useEffect } from "react";
import { DEFAULT_MODEL_SETTINGS, CHAT_MODELS } from "@/config/models";

export default function ModelSettings() {
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL_SETTINGS.modelId);
  const [temperature, setTemperature] = useState<number>(DEFAULT_MODEL_SETTINGS.temperature);
  const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_MODEL_SETTINGS.systemPrompt);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch("/api/settings?key=modelSettings");

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const { modelId, temperature: storedTemp, systemPrompt: storedPrompt } = data.data;
            setSelectedModel(modelId);
            setTemperature(storedTemp);
            setSystemPrompt(storedPrompt);
          }
        } else {
          const storedSettings = localStorage.getItem("modelSettings");
          if (storedSettings) {
            const { modelId, temperature: storedTemp, systemPrompt: storedPrompt } = JSON.parse(storedSettings);
            setSelectedModel(modelId);
            setTemperature(storedTemp);
            setSystemPrompt(storedPrompt);
          }
        }
      } catch (error) {
        console.error("Error al cargar configuraciones:", error);
        setError("No se pudieron cargar las configuraciones. Por favor, intenta de nuevo.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSaveSettings = async () => {
    try {
      setError(null);
      const settings = {
        modelId: selectedModel,
        temperature,
        systemPrompt,
      };

      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: "modelSettings", data: settings }),
      });

      if (!response.ok) throw new Error("Error al guardar en la API");

      localStorage.setItem("modelSettings", JSON.stringify(settings));

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);

      window.dispatchEvent(new CustomEvent("settingsChanged", { detail: settings }));
    } catch (error) {
      console.error("Error al guardar configuraciones:", error);
      setError("No se pudieron guardar las configuraciones. Por favor, intenta de nuevo.");
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto py-8">
        <div className="bg-white shadow-sm rounded-lg p-6 flex justify-center items-center">
          <div className="animate-spin h-6 w-6 border-2 border-[#01f6d2] border-t-transparent rounded-full mr-3"></div>
          <p>Cargando configuraciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-medium text-gray-900">Configuración del Modelo</h2>
          <p className="mt-1 text-sm text-black">
            Ajusta el modelo, temperatura y sistema de instrucciones
          </p>
        </div>

        {error && (
          <div className="p-4 mb-4 bg-red-50 border border-red-200 text-red-800 rounded-md">
            {error}
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Modelo */}
          <div>
            <label className="block text-sm font-bold text-black mb-2">Modelo</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CHAT_MODELS.map((model) => (
                <div key={model.id} className="relative">
                  <input
                    type="radio"
                    id={model.id}
                    name="model"
                    value={model.id}
                    checked={selectedModel === model.id}
                    onChange={() => setSelectedModel(model.id)}
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
                      {selectedModel === model.id && (
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
              Temperatura: {temperature.toFixed(1)}
            </label>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-black">0.0</span>
              <input
                id="temperature"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #01f6d2 0%, #01f6d2 ${
                    temperature * 100
                  }%, #e5e7eb ${temperature * 100}%, #e5e7eb 100%)`,
                }}
              />
              <span className="text-sm text-black">1.0</span>
            </div>
            <div className="text-xs text-black mt-2 grid grid-cols-2">
              <span>Más preciso y determinista</span>
              <span className="text-right">Más creativo y variable</span>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label htmlFor="system-prompt" className="block text-sm font-bold text-black mb-2">
              Instrucciones de Sistema
            </label>
            <textarea
              id="system-prompt"
              rows={6}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#01f6d2] focus:border-transparent text-gray-800"
              placeholder="Ingresa las instrucciones para el modelo..."
            />
            <p className="text-xs text-black mt-2">
              Define cómo debe comportarse el asistente AI y cómo debe responder a las consultas.
            </p>
          </div>

          {/* Guardar */}
          <div className="pt-4">
            <button
              type="button"
              onClick={handleSaveSettings}
              className="w-full md:w-auto px-4 py-2 bg-[#01f6d2] text-white font-medium rounded-lg hover:bg-[#00d9b9] focus:outline-none focus:ring-2 focus:ring-[#01f6d2] focus:ring-offset-2"
            >
              {isSaved ? "✓ Configuración Guardada" : "Guardar Configuración"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
