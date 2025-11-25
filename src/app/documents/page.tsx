"use client";

import { useState, useEffect } from "react";
import {
  DocumentTextIcon,
  TrashIcon,
  ArrowPathIcon,
  DocumentIcon,
  GlobeAltIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import UploadDocumentModal from "@/components/UploadDocumentModal";
import AddTextModal from "@/components/AddTextModal";
import AddUrlModal from "@/components/AddUrlModal";

type Source = {
  id?: string;
  filename: string;
  type: string;
  size: string;
  uploadDate: string;
  vectorsUploaded: number;
  namespace?: string;
  status: number;
};

type ModalType = "document" | "text" | "url" | null;

export default function DocumentsPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Cargar la lista de fuentes
  useEffect(() => {
    async function fetchSources() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/weaviate");

        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
          if (data.fileExistsInDB === null) {
            setSources([]);
            setActionInProgress(false);
            return;
          }

          setSources([data.fileExistsInDB]);
          setActionInProgress(true);
        } else {
          throw new Error(data.error || "Error al cargar las fuentes");
        }
      } catch (error) {
        console.error("Error fetching sources:", error);
        setError(error instanceof Error ? error.message : "Error desconocido");
        setSources([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSources();
  }, [refreshKey]); // Refrescar cuando cambie refreshKey

  // Función para eliminar una fuente
  const handleDeleteSource = async (id: string, name: string) => {
    if (
      !confirm(
        `¿Estás seguro de que quieres eliminar "${name}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setActionInProgress(true);

    try {
      const response = await fetch("/api/delete-weaviate", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Error ${response.status}`);
      }

      // Actualizar la lista de fuentes
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Error deleting source:", error);
      alert(
        `Error al eliminar la fuente: ${
          error instanceof Error ? error.message : "Error desconocido"
        }`
      );
    } finally {
      setActionInProgress(false);
    }
  };

  // Formatear fecha
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat("es", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch (e) {
      console.error("Error formateando fecha:", e);
      return "Fecha desconocida";
    }
  };

  // Función para mostrar el tipo de archivo con un icono
  const getFileTypeDisplay = (type: string) => {
    if (type.includes("pdf")) {
      return "PDF";
    } else if (type.includes("docx") || type.includes("word")) {
      return "DOCX";
    } else if (type.includes("text")) {
      return "TXT";
    } else if (type === "url") {
      return "URL";
    } else {
      return type.split("/").pop()?.toUpperCase() || "DOC";
    }
  };

  // Función para refrescar la lista de fuentes
  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  // Manejar evento de carga exitosa desde el modal
  const handleModalSuccess = () => {
    setActiveModal(null);
    setRefreshKey((prev) => prev + 1);
  };

  // Función para renderizar icono según el tipo
  const renderSourceIcon = (type: string) => {
    if (type === "url") {
      return <GlobeAltIcon className="h-6 w-6" />;
    } else if (type === "text") {
      return <PencilIcon className="h-6 w-6" />;
    } else {
      return <DocumentIcon className="h-6 w-6" />;
    }
  };

  // Botón simple para subir documento
  const AddSourceButton = () => (
    <button
      onClick={() => setActiveModal("document")}
      className="px-4 py-2 bg-[#01f6d2] text-black rounded-lg hover:bg-teal-500"
    >
      Subir documento
    </button>
  );

  return (
    <main className="container mx-auto px-4 py-8">
      <header className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-[#01f6d2]">
            Gestión de Fuentes
          </h1>
          <div className="flex space-x-2">
            <button
              onClick={handleRefresh}
              className="flex items-center justify-center p-2 bg-white text-[#01f6d2] rounded-full hover:bg-gray-100 border border-[#01f6d2]"
              title="Actualizar lista"
            >
              <ArrowPathIcon className="w-5 h-5" />
            </button>
            <AddSourceButton />
          </div>
        </div>
        <nav className="flex mb-6">
          <Link href="/" className="text-[#01f6d2] hover:underline">
            Inicio
          </Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-black">Fuentes</span>
        </nav>
      </header>

      {/* Contenido principal */}
      <div className="bg-white rounded-lg shadow p-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#01f6d2]"></div>
            <span className="ml-3 text-lg text-black">Cargando fuentes...</span>
          </div>
        ) : error ? (
          <div className="text-center p-8">
            <div className="text-red-500 mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h3 className="text-lg font-semibold mt-2">
                Error al cargar las fuentes
              </h3>
              <p className="text-sm mt-1 text-black">{error}</p>
            </div>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-[#01f6d2] text-black rounded-lg hover:bg-teal-500"
            >
              Intentar de nuevo
            </button>
          </div>
        ) : !actionInProgress ? (
          <div className="text-center p-10">
            <DocumentTextIcon className="h-16 w-16 mx-auto text-[#01f6d2]" />
            <h2 className="text-xl font-semibold mt-4 text-[#01f6d2]">
              No hay fuentes
            </h2>
            <p className="mt-1 text-black">
              Añade tu primera fuente para comenzar
            </p>
            <div className="mt-6 flex justify-center space-x-4">
              <button
                onClick={() => setActiveModal("document")}
                className="px-4 py-2 bg-[#01f6d2] text-black rounded-lg hover:bg-teal-500"
              >
                Subir documento
              </button>
              {/**<button
                onClick={() => setActiveModal("text")}
                className="px-4 py-2 bg-[#01f6d2] text-black rounded-lg hover:bg-teal-500"
              >
                Añadir texto
              </button>
              <button
                onClick={() => setActiveModal("url")}
                className="px-4 py-2 bg-[#01f6d2] text-black rounded-lg hover:bg-teal-500"
              >
                Añadir enlace web
              </button>**/}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Fuente
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Fragmentos
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Namespace
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Fecha de carga
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sources.map((source, index) => (
                  <tr
                    key={source.id || `source-${index}`}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center">
                        <div
                          className={`flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-md
                          ${"bg-blue-100 text-blue-600"}`}
                        >
                          {renderSourceIcon(source.type)}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                            {source.filename}
                          </div>
                          <div className="text-xs text-gray-500">
                            {source.size}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${"bg-blue-100 text-blue-800"}`}
                      >
                        {getFileTypeDisplay(source.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {source.vectorsUploaded || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {source.namespace || "default"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {formatDate(source.uploadDate)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-center">
                      <button
                        onClick={() =>
                          handleDeleteSource(source.id ?? "", source.filename)
                        }
                        disabled={source.status === 1}
                        className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 disabled:opacity-50"
                        title="Eliminar fuente"
                      >
                        {source.status === 1 ? (
                          <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <TrashIcon className="h-5 w-5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modales para añadir fuentes */}
      <UploadDocumentModal
        isOpen={activeModal === "document"}
        onClose={() => setActiveModal(null)}
        onSuccess={handleModalSuccess}
      />

      <AddTextModal
        isOpen={activeModal === "text"}
        onClose={() => setActiveModal(null)}
        onSuccess={handleModalSuccess}
      />

      <AddUrlModal
        isOpen={activeModal === "url"}
        onClose={() => setActiveModal(null)}
        onSuccess={handleModalSuccess}
      />
    </main>
  );
}
