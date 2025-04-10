"use client";

import {useState, useEffect} from "react";
import FileUpload from "@/components/FileUpload";
import ProcessingStatus from "@/components/ProcessingStatus";
import SourcesList from "@/components/SourcesList";
import TextInput from "@/components/TextInput";
import UrlInput from "@/components/UrlInput";
import {Source} from "@/types/source";

type SourceTab = "documents" | "text" | "url";

export default function SourcesPage() {
  const [activeTab, setActiveTab] = useState<SourceTab>("documents");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);

  // En una aplicación real, cargaríamos las fuentes al iniciar
  useEffect(() => {
    const fetchSources = async () => {
      try {
        setIsProcessing(true);
        setProcessingMessage("Cargando fuentes...");

        // Usar el endpoint específico para obtener fuentes de Pinecone
        const response = await fetch("/api/pinecone-sources", {method: "GET"});

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.sources && Array.isArray(data.sources)) {
            setSources(data.sources);
            console.log(`Cargadas ${data.sources.length} fuentes de Pinecone`);
          } else {
            console.log("No se encontraron fuentes en Pinecone");
          }
        } else {
          console.error(
            "Error al cargar fuentes de Pinecone:",
            await response.text(),
          );
        }
      } catch (error) {
        console.error("Error al cargar las fuentes:", error);
        setError(
          error instanceof Error
            ? error.message
            : "Error desconocido al cargar fuentes",
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

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || `Error procesando archivos: ${response.status}`,
        );
      }

      // Actualizar lista de fuentes con los nuevos archivos
      /* eslint-disable */
      const newSources: Source[] = (data.processedFiles || []).map(
        (result: any) => ({
          id: Math.random().toString(36).substring(2, 9),
          name: result.filename,
          type: result.filename.split(".").pop() || "unknown",
          size: `${Math.round(result.size / 1024)} KB`, // Ahora usamos el tamaño real del archivo
          uploadDate: new Date().toISOString(),
          chunkCount: result.chunks || 0,
        }),
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || `Error procesando texto: ${response.status}`,
        );
      }

      // Añadir la nueva fuente a la lista
      const parsedData = JSON.parse(textData);
      const newSource: Source = {
        id: data.sourceId,
        name: parsedData.name,
        type: "text",
        size: `${Math.round(parsedData.text.length / 1024)} KB`,
        uploadDate: new Date().toISOString(),
        chunkCount: data.chunksProcessed,
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || `Error procesando URL: ${response.status}`,
        );
      }

      // Añadir la nueva fuente a la lista
      const parsedData = JSON.parse(urlData);
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
      const response = await fetch("/api/delete-source", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({id}),
      });

      const data = await response.json();

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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16m-7 6h7"
                />
              </svg>
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              URL
            </button>
          </div>
        </div>

        {/* Mostrar el componente correcto según el tab activo */}
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
