"use client";

import { useState, useEffect } from "react";
import FileUpload from "@/components/FileUpload";
import ProcessingStatus from "@/components/ProcessingStatus";
import SourcesList from "@/components/SourcesList";
import TextInput from "@/components/TextInput";
import UrlInput from "@/components/UrlInput";
import { Source } from "@/types/source";

type SourceTab = "documents" | "text" | "url";

interface ProcessedFile {
  filename: string;
  size: number;
  chunks?: number;
}

interface FetchSourcesResponse {
  success?: boolean;
  sources?: Source[];
}

interface UploadResponse {
  error?: string;
  processedFiles?: ProcessedFile[];
  sourceId?: string;
  chunksProcessed?: number;
}

export default function SourcesPage() {
  const [activeTab, setActiveTab] = useState<SourceTab>("documents");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSources = async () => {
      try {
        setIsProcessing(true);
        setProcessingMessage("Cargando fuentes...");

        const response = await fetch("/api/records-weaviate", { method: "GET" });

        const data: FetchSourcesResponse = await response.json();

        if (response.ok) {
          if (data.success && data.sources && Array.isArray(data.sources)) {
            setSources(data.sources);
          }
        } else {
          console.error("Error al cargar fuentes:", await response.text());
        }
      } catch (error) {
        console.error("Error al cargar las fuentes:", error);
        setError(
          error instanceof Error
            ? error.message
            : "Error desconocido al cargar fuentes"
        );
      } finally {
        setIsProcessing(false);
        setProcessingMessage("");
      }
    };

    fetchSources();
  }, []);

  const handleFilesUploaded = async (files: File[]) => {
    setIsProcessing(true);
    setProcessingMessage("Procesando archivos...");
    setError(null);

    try {
      const formData = new FormData();

      files.forEach((file) => {
        formData.append("file", file);
      });

      const response = await fetch("/api/upload-weaviate", {
        method: "POST",
        body: formData,
      });

      const data: UploadResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || `Error procesando archivos: ${response.status}`
        );
      }

      const newSources: Source[] = (data.processedFiles || []).map(
        (result: ProcessedFile) => ({
          id: Math.random().toString(36).substring(2, 9),
          name: result.filename,
          type: result.filename.split(".").pop() || "unknown",
          size: `${Math.round(result.size / 1024)} KB`,
          uploadDate: new Date().toISOString(),
          chunkCount: result.chunks || 0,
        })
      );

      setSources((prev) => [...prev, ...newSources]);
      setProcessingMessage("Archivos procesados correctamente");
    } catch (err) {
      console.error("Error al procesar archivos:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setProcessingMessage("");
      }, 3000);
    }
  };

  const handleTextUploaded = async (textData: string) => {
    setIsProcessing(true);
    setProcessingMessage("Procesando texto...");
    setError(null);

    try {
      const response = await fetch("/api/upload-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: textData,
      });

      const data: UploadResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || `Error procesando texto: ${response.status}`
        );
      }

      const parsedData: { name: string; text: string } = JSON.parse(textData);
      const newSource: Source = {
        id: data.sourceId || Math.random().toString(36).substring(2, 9),
        name: parsedData.name,
        type: "text",
        size: `${Math.round(parsedData.text.length / 1024)} KB`,
        uploadDate: new Date().toISOString(),
        chunkCount: data.chunksProcessed || 0,
      };

      setSources((prev) => [...prev, newSource]);
      setProcessingMessage("Texto procesado correctamente");
    } catch (err) {
      console.error("Error al procesar texto:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setProcessingMessage("");
      }, 3000);
    }
  };

  const handleUrlUploaded = async (urlData: string) => {
    setIsProcessing(true);
    setProcessingMessage("Procesando URL...");
    setError(null);

    try {
      const response = await fetch("/api/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: urlData,
      });

      const data: UploadResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || `Error procesando URL: ${response.status}`
        );
      }

      const parsedData: { name: string; url: string } = JSON.parse(urlData);
      const newSource: Source = {
        id: data.sourceId || Math.random().toString(36).substring(2, 9),
        name: parsedData.name,
        type: "url",
        size: "N/A",
        uploadDate: new Date().toISOString(),
        chunkCount: data.chunksProcessed || 0,
        url: parsedData.url,
      };

      setSources((prev) => [...prev, newSource]);
      setProcessingMessage("URL procesada correctamente");
    } catch (err) {
      console.error("Error al procesar URL:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setProcessingMessage("");
      }, 3000);
    }
  };

  const handleDeleteSource = async (id: string) => {
    setIsProcessing(true);
    setProcessingMessage("Eliminando fuente...");
    setError(null);

    try {
      const response = await fetch("/api/delete-weaviate", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data: { error?: string } = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error eliminando la fuente");
      }

      setSources((prev) => prev.filter((source) => source.id !== id));
      setProcessingMessage("Fuente eliminada correctamente");
    } catch (err) {
      console.error("Error al eliminar fuente:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setProcessingMessage("");
      }, 3000);
    }
  };

  return (
    <main className="py-8 px-4">
      <div className="max-w-5xl mx-auto mb-8 p-4 rounded-lg bg-gray-800">
        <h1 className="text-2xl font-bold text-[#01f6d2] mb-2">Fuentes</h1>
        <p className="text-white text-base font-medium">
          Gestiona los documentos, textos y URLs que se utilizarán para
          responder consultas
        </p>
      </div>

      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <div className="flex border-b border-gray-200 space-x-4 bg-gray-800 p-2 rounded-t-lg">
            <button
              className={`${
                activeTab === "documents"
                  ? "border-[#01f6d2] text-white font-semibold"
                  : "border-transparent text-gray-300 hover:text-white hover:border-gray-300"
              } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              onClick={() => setActiveTab("documents")}
            >
              Documentos
            </button>
            <button
              className={`${
                activeTab === "text"
                  ? "border-[#01f6d2] text-white font-semibold"
                  : "border-transparent text-gray-300 hover:text-white hover:border-gray-300"
              } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              onClick={() => setActiveTab("text")}
            >
              Texto
            </button>
            <button
              className={`${
                activeTab === "url"
                  ? "border-[#01f6d2] text-white font-semibold"
                  : "border-transparent text-gray-300 hover:text-white hover:border-gray-300"
              } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              onClick={() => setActiveTab("url")}
            >
              URL
            </button>
          </div>
        </div>

        <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
          {activeTab === "documents" && (
            <FileUpload
              onFilesUploaded={handleFilesUploaded}
              isProcessing={isProcessing}
            />
          )}
          {activeTab === "text" && (
            <TextInput
              onTextUploaded={handleTextUploaded}
              isProcessing={isProcessing}
            />
          )}
          {activeTab === "url" && (
            <UrlInput
              onUrlUploaded={handleUrlUploaded}
              isProcessing={isProcessing}
            />
          )}

          {(isProcessing || processingMessage) && (
            <div className="mt-4">
              <ProcessingStatus
                isProcessing={isProcessing}
                message={processingMessage}
                error={error}
              />
            </div>
          )}
        </div>

        <div className="mt-8">
          <SourcesList initialSources={sources} onDelete={handleDeleteSource} />
        </div>
      </div>
    </main>
  );
}
