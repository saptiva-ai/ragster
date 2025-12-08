"use client";

import {useState, useRef, useEffect} from "react";
import {XMarkIcon, CheckCircleIcon} from "@heroicons/react/24/outline";

interface AddTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddTextModal({
  isOpen,
  onClose,
  onSuccess,
}: AddTextModalProps) {
  const [textContent, setTextContent] = useState("");
  const [textName, setTextName] = useState("");
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
        setTextContent("");
        setTextName("");
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

  // Manejo de inputs
  const handleTextNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextName(e.target.value || "");
  };

  const handleTextContentChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setTextContent(e.target.value || "");
  };

  // Enviar texto
  const handleSubmit = async () => {
    if (!textContent || !textName) return;

    setIsSubmitting(true);
    setUploadResult(null);

    try {
      // Preparar los datos
      const textData = JSON.stringify({
        text: textContent,
        name: textName,
        namespace: "default",
      });

      // Enviar solicitud
      const response = await fetch("/api/upload-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: textData,
      });

      if (response.ok) {
        setUploadResult({
          success: true,
          message: `Texto "${textName}" añadido exitosamente.`,
        });

        // Notificar éxito después de un breve retraso
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        const error = await response.json();
        setUploadResult({
          success: false,
          message: error.error || "Error al añadir el texto",
        });
      }
    } catch (error) {
      console.error("Error al añadir texto:", error);
      setUploadResult({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido al añadir el texto",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Si no está abierto, no renderizar nada
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-100/90 backdrop-blur-sm flex justify-center items-center p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-lg max-w-lg w-full shadow-xl transition-all transform"
        style={{maxWidth: "650px"}}
      >
        {/* Cabecera */}
        <div className="flex justify-between items-center p-5 border-b">
          <h3 className="text-xl font-semibold text-[#01f6d2]">
            Añadir texto manualmente
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
                  ? "Texto añadido"
                  : "Error al añadir texto"}
              </h3>
              <p className="mt-1 text-sm text-black">{uploadResult.message}</p>
            </div>
          ) : (
            <>
              {/* Nombre del texto */}
              <div className="mb-4">
                <label
                  htmlFor="textName"
                  className="block text-sm font-medium text-black mb-1"
                >
                  Nombre del documento
                </label>
                <input
                  type="text"
                  id="textName"
                  name="textName"
                  value={textName || ""}
                  onChange={handleTextNameChange}
                  className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#01f6d2] focus:border-[#01f6d2] sm:text-sm placeholder-gray-600"
                  placeholder="Ejemplo: Política de privacidad"
                  disabled={isSubmitting}
                  required
                />
              </div>

              {/* Campo de texto */}
              <div className="mb-4">
                <label
                  htmlFor="textContent"
                  className="block text-sm font-medium text-black mb-1"
                >
                  Contenido
                </label>
                <div className="relative">
                  <textarea
                    id="textContent"
                    name="textContent"
                    rows={12}
                    value={textContent || ""}
                    onChange={handleTextContentChange}
                    className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#01f6d2] focus:border-[#01f6d2] sm:text-sm placeholder-gray-600"
                    placeholder="Ingresa el texto que deseas añadir como fuente para consultas..."
                    disabled={isSubmitting}
                    required
                  />
                  <div className="absolute bottom-2 right-2 text-xs text-black">
                    {textContent?.length || 0} caracteres
                  </div>
                </div>
              </div>

              {/* Selección de namespace 
              <div className="mt-4">
                <label className="block text-sm font-medium text-black mb-1">
                  Namespace del texto
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
                  El namespace ayuda a organizar tus documentos en colecciones
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
                  !textContent || !textName || isSubmitting
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-[#01f6d2] hover:bg-teal-400"
                }`}
                disabled={!textContent || !textName || isSubmitting}
              >
                {isSubmitting ? "Procesando..." : "Añadir texto"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
