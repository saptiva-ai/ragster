"use client";

import {useState} from "react";

type UrlInputProps = {
  onUrlUploaded: (urlData: string) => Promise<void>;
  isProcessing: boolean;
};

export default function UrlInput({onUrlUploaded, isProcessing}: UrlInputProps) {
  const [url, setUrl] = useState<string>("");
  const [name, setName] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !name.trim()) return;

    // Validación básica de URL
    try {
      new URL(url); // Esto lanzará error si la URL no es válida
      await onUrlUploaded(JSON.stringify({url, name}));
      // Limpiar formulario después de éxito
      setUrl("");
      setName("");
    } catch (error) {
      console.error("URL inválida:", error);
      alert("Por favor, ingresa una URL válida");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="urlName"
          className="block text-sm font-bold text-black mb-1"
        >
          Nombre del sitio
        </label>
        <input
          type="text"
          id="urlName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Documentación de React"
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-[#01f6d2] focus:border-[#01f6d2] text-gray-800"
          disabled={isProcessing}
        />
      </div>

      <div>
        <label
          htmlFor="urlContent"
          className="block text-sm font-bold text-black mb-1"
        >
          URL
        </label>
        <input
          type="url"
          id="urlContent"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://ejemplo.com/pagina"
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-[#01f6d2] focus:border-[#01f6d2] text-gray-800"
          disabled={isProcessing}
        />
        <p className="mt-1 text-xs text-black">
          Se extraerá el contenido textual de la página web
        </p>
      </div>

      <button
        type="submit"
        disabled={isProcessing || !url.trim() || !name.trim()}
        className={`px-4 py-2 rounded-md ${
          isProcessing || !url.trim() || !name.trim()
            ? "bg-gray-300 cursor-not-allowed"
            : "bg-[#01f6d2] hover:bg-[#00d9b9] text-white"
        }`}
      >
        {isProcessing ? (
          <div className="flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            <span>Procesando...</span>
          </div>
        ) : (
          "Procesar URL"
        )}
      </button>
    </form>
  );
}
