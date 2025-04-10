"use client";

import {useState, useRef, useEffect} from "react";
import {
  XMarkIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadDocumentModal({
  isOpen,
  onClose,
  onSuccess,
}: UploadDocumentModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [namespace, setNamespace] = useState<string>("default");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [availableNamespaces, setAvailableNamespaces] = useState<string[]>([
    "default",
    "test_docs",
  ]);
  const [newNamespace, setNewNamespace] = useState("");
  const [showNamespaceInput, setShowNamespaceInput] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Cargar namespaces disponibles
  useEffect(() => {
    const fetchNamespaces = async () => {
      try {
        const response = await fetch("/api/query?listNamespaces=true");
        if (response.ok) {
          const data = await response.json();
          if (data.namespaces && Array.isArray(data.namespaces)) {
            setAvailableNamespaces(data.namespaces);
          }
        }
      } catch (error) {
        console.error("Error al cargar namespaces:", error);
      }
    };

    if (isOpen) {
      fetchNamespaces();
    }
  }, [isOpen]);

  // Resetear estado al cerrar
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setFiles([]);
        setUploadResult(null);
        setIsUploading(false);
      }, 300);
    }
  }, [isOpen]);

  // Cerrar con ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isUploading) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose, isUploading]);

  // Cerrar haciendo clic fuera del modal
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(e.target as Node) &&
        !isUploading
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen, onClose, isUploading]);

  // Manejar selección de archivos
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
    }
  };

  // Añadir namespace nuevo
  const handleAddNewNamespace = () => {
    if (newNamespace && !availableNamespaces.includes(newNamespace)) {
      setAvailableNamespaces([...availableNamespaces, newNamespace]);
      setNamespace(newNamespace);
      setNewNamespace("");
      setShowNamespaceInput(false);
    }
  };

  // Manejadores de inputs para evitar convertirse en no controlados
  const handleNewNamespaceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewNamespace(e.target.value || "");
  };

  const handleNamespaceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNamespace(e.target.value || "default");
  };

  // Subir archivos
  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();

      // Añadir todos los archivos
      files.forEach((file) => {
        formData.append("files", file);
      });

      // Añadir namespace
      formData.append("namespace", namespace);

      // Configurar el tiempo estimado de carga basado en el tamaño de los archivos
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const estimatedTimePerMB = 500; // ms por MB (ajustable)
      const totalEstimatedTime =
        (totalSize / (1024 * 1024)) * estimatedTimePerMB;

      // Simular progreso mientras se carga
      const progressInterval = setInterval(() => {}, totalEstimatedTime / 20);

      // Realizar la carga
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      // Limpiar intervalo de progreso
      clearInterval(progressInterval);

      if (response.ok) {
        setUploadResult({
          success: true,
          message: `${files.length} ${
            files.length === 1 ? "documento subido" : "documentos subidos"
          } con éxito.`,
        });

        // Notificar éxito después de un breve retraso
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        const error = await response.json();
        setUploadResult({
          success: false,
          message: error.error || "Error al subir los documentos",
        });
      }
    } catch (error) {
      console.error("Error uploading files:", error);
      setUploadResult({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido al subir los documentos",
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-800 bg-opacity-75 flex justify-center items-center p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-lg max-w-lg w-full shadow-xl transition-all transform"
        style={{maxWidth: "550px"}}
      >
        {/* Cabecera */}
        <div className="flex justify-between items-center p-5 border-b">
          <h3 className="text-xl font-semibold text-[#01f6d2]">
            Subir documento
          </h3>
          {!isUploading && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Contenido */}
        <div className="p-5">
          {uploadResult ? (
            <div
              className={`text-center p-4 rounded-lg ${
                uploadResult.success ? "bg-green-50" : "bg-red-50"
              }`}
            >
              <div
                className={`mx-auto h-12 w-12 flex items-center justify-center rounded-full ${
                  uploadResult.success ? "bg-green-100" : "bg-red-100"
                }`}
              >
                {uploadResult.success ? (
                  <CheckCircleIcon className="h-8 w-8 text-green-600" />
                ) : (
                  <XMarkIcon className="h-8 w-8 text-red-600" />
                )}
              </div>
              <h3
                className={`mt-2 text-lg font-medium ${
                  uploadResult.success ? "text-green-900" : "text-red-900"
                }`}
              >
                {uploadResult.success
                  ? "Documento procesado"
                  : "Error al procesar documento"}
              </h3>
              <p className="mt-1 text-sm text-black">{uploadResult.message}</p>
            </div>
          ) : (
            <>
              {/* Input de archivo */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-black mb-1">
                  Documento
                </label>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg px-6 pt-5 pb-6 cursor-pointer hover:border-[#01f6d2]"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="space-y-1 text-center">
                    <div className="flex flex-col items-center">
                      <DocumentArrowUpIcon className="mx-auto h-12 w-12 text-[#01f6d2]" />
                      <div className="flex text-sm text-black">
                        <label
                          htmlFor="file-upload"
                          className="relative cursor-pointer font-medium text-[#01f6d2] hover:text-teal-400"
                        >
                          <span>Selecciona un archivo</span>
                          <input
                            ref={fileInputRef}
                            id="file-upload"
                            name="file-upload"
                            type="file"
                            className="sr-only"
                            onChange={handleFileChange}
                            accept=".pdf,.docx,.txt,.md"
                            disabled={isUploading}
                          />
                        </label>
                        <p className="pl-1">o arrastra y suelta</p>
                      </div>
                      <p className="text-xs text-black">
                        PDF, DOCX, TXT hasta 10MB
                      </p>
                    </div>
                  </div>
                </div>
                {files.length > 0 && (
                  <div className="mt-2 flex items-center">
                    <DocumentTextIcon className="h-5 w-5 text-[#01f6d2]" />
                    <span className="ml-1 text-sm text-black">
                      {files[0].name}
                    </span>
                  </div>
                )}
              </div>

              {/* Selección de namespace */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-black mb-1">
                  Namespace del documento
                </label>
                {showNamespaceInput ? (
                  <div className="flex">
                    <input
                      type="text"
                      value={newNamespace || ""}
                      onChange={handleNewNamespaceChange}
                      className="flex-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-[#01f6d2] focus:border-[#01f6d2] sm:text-sm placeholder-gray-600"
                      placeholder="Ingresa un nuevo namespace"
                    />
                    <button
                      type="button"
                      onClick={handleAddNewNamespace}
                      className="ml-2 px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-black bg-[#01f6d2] hover:bg-teal-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#01f6d2]"
                    >
                      Añadir
                    </button>
                  </div>
                ) : (
                  <div className="flex">
                    <select
                      value={namespace || "default"}
                      onChange={handleNamespaceChange}
                      className="flex-1 block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-[#01f6d2] focus:border-[#01f6d2] sm:text-sm"
                      disabled={isUploading}
                    >
                      {availableNamespaces.map((ns) => (
                        <option key={ns} value={ns}>
                          {ns}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNamespaceInput(true)}
                      className="ml-2 px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-[#01f6d2] bg-white hover:bg-gray-100 border border-[#01f6d2] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#01f6d2]"
                    >
                      + Nuevo
                    </button>
                  </div>
                )}
                <p className="mt-1 text-xs text-black">
                  El namespace ayuda a organizar tus documentos en colecciones
                  separadas.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Pie del modal */}
        <div className="px-5 py-4 bg-gray-50 border-t rounded-b-lg flex justify-end">
          {uploadResult?.success ? (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-black bg-[#01f6d2] rounded-md hover:bg-teal-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#01f6d2]"
            >
              Cerrar
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-black bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#01f6d2] mr-3"
                disabled={isUploading}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpload}
                className={`px-4 py-2 text-sm font-medium text-black rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#01f6d2] ${
                  files.length === 0 || isUploading
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-[#01f6d2] hover:bg-teal-400"
                }`}
                disabled={files.length === 0 || isUploading}
              >
                {isUploading ? "Subiendo..." : "Subir documento"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
