"use client";

import {useState, useRef, useEffect} from "react";
import {
  XMarkIcon,
  GlobeAltIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

interface AddUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddUrlModal({
  isOpen,
  onClose,
  onSuccess,
}: AddUrlModalProps) {
  const [url, setUrl] = useState("");
  const [urlName, setUrlName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  // Resetear estado al cerrar
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setUrl("");
        setUrlName("");
        setUploadResult(null);
        setIsSubmitting(false);
      }, 300);
    }
  }, [isOpen]);

  // Cerrar con ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose, isSubmitting]);

  // Cerrar haciendo clic fuera del modal
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(e.target as Node) &&
        !isSubmitting
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
  }, [isOpen, onClose, isSubmitting]);

  // Extraer el título de la URL al pegar
  const handleUrlPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedUrl = e.clipboardData.getData("text");

    // Si la URL ya está pegada o no es una URL válida, salir
    if (url || !pastedUrl.startsWith("http")) return;

    // Validar mínimamente si parece una URL
    if (pastedUrl.startsWith("http") && !urlName) {
      try {
        // Intentar obtener el título si no hay nombre
        const urlObj = new URL(pastedUrl);
        setUrlName(urlObj.hostname.replace("www.", ""));
      } catch (error) {
        console.error("URL inválida:", error);
      }
    }
  };

  // Validar URL
  const isValidUrl = (urlString: string): boolean => {
    try {
      const url = new URL(urlString);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (e) {
      console.error("URL inválida:", e);
      return false;
    }
  };

  // Manejadores de cambio en inputs
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value || "");
  };

  const handleUrlNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrlName(e.target.value || "");
  };

  // Enviar URL
  const handleSubmit = async () => {
    if (!url || !urlName || !isValidUrl(url)) {
      setUploadResult({
        success: false,
        message: "Por favor, ingresa una URL válida y un nombre para la fuente",
      });
      return;
    }

    setIsSubmitting(true);
    setUploadResult(null);

    try {
      // Preparar los datos
      const urlData = JSON.stringify({
        url: url,
        name: urlName,
        namespace: "default",
      });

      // Enviar solicitud
      const response = await fetch("/api/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: urlData,
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setUploadResult({
          success: true,
          message: `URL "${urlName}" procesada exitosamente.`,
        });

        // Notificar éxito después de un breve retraso
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        setUploadResult({
          success: false,
          message: result.error || "Error al procesar la URL",
        });
      }
    } catch (error) {
      console.error("Error al procesar URL:", error);
      setUploadResult({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido al procesar la URL",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Si no está abierto, no renderizar nada
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
            Añadir enlace web
          </h3>
          {!isSubmitting && (
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
                  ? "URL procesada"
                  : "Error al procesar URL"}
              </h3>
              <p className="mt-1 text-sm text-black">{uploadResult.message}</p>
            </div>
          ) : (
            <>
              {/* URL de la página */}
              <div className="mb-4">
                <label
                  htmlFor="url"
                  className="block text-sm font-medium text-black mb-1"
                >
                  URL
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <GlobeAltIcon className="h-5 w-5 text-[#01f6d2]" />
                  </div>
                  <input
                    type="url"
                    id="url"
                    name="url"
                    value={url || ""}
                    onChange={handleUrlChange}
                    onPaste={handleUrlPaste}
                    className="focus:ring-[#01f6d2] focus:border-[#01f6d2] block w-full pl-10 pr-12 sm:text-sm border-gray-300 rounded-md placeholder-gray-600"
                    placeholder="https://ejemplo.com/pagina"
                    disabled={isSubmitting}
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-black">
                  Ingresa la URL completa, incluyendo https://
                </p>
              </div>

              {/* Nombre para la URL */}
              <div className="mb-4">
                <label
                  htmlFor="urlName"
                  className="block text-sm font-medium text-black mb-1"
                >
                  Nombre de la fuente
                </label>
                <input
                  type="text"
                  id="urlName"
                  name="urlName"
                  value={urlName || ""}
                  onChange={handleUrlNameChange}
                  className="focus:ring-[#01f6d2] focus:border-[#01f6d2] block w-full sm:text-sm border-gray-300 rounded-md placeholder-gray-600"
                  placeholder="Ejemplo: Documentación API"
                  disabled={isSubmitting}
                  required
                />
                <p className="mt-1 text-xs text-black">
                  Un nombre descriptivo para identificar esta fuente
                </p>
              </div>

              {/* Selección de namespace 
              <div className="mt-4">
                <label className="block text-sm font-medium text-black mb-1">
                  Namespace de la URL
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
                      disabled={isSubmitting}
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
                  El namespace ayuda a organizar tus fuentes en colecciones
                  separadas.
                </p>
              </div>*/}
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
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className={`px-4 py-2 text-sm font-medium text-black rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#01f6d2] ${
                  !isValidUrl(url) || !urlName || isSubmitting
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-[#01f6d2] hover:bg-teal-400"
                }`}
                disabled={!isValidUrl(url) || !urlName || isSubmitting}
              >
                {isSubmitting ? "Procesando..." : "Procesar URL"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
