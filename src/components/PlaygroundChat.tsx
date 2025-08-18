"use client";

import {useState, useRef, useEffect} from "react";
import {v4 as uuidv4} from "uuid";

type Source = {
  name: string;
  excerpt: string;
  relevanceScore?: number;
  fileType?: string;
  uploadDate?: string;
  sourceId?: string;
};

type Match = {
  id: string;
  score: number;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
};

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  sources?: Source[];
  matches?: Match[];
  modelInfo?: {
    id: string;
    provider: string;
  };
  isTyping?: boolean;
};

// Esto debe coincidir con los valores almacenados en la API
type StoredSettings = {
  modelId: string;
  temperature: number;
  systemPrompt: string;
};

export default function PlaygroundChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStage, setLoadingStage] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState("");

  if (token === "") {
    setToken(uuidv4());
  }

  // Obtener configuraciones del modelo
  const [modelSettings, setModelSettings] = useState<StoredSettings>({
    modelId: "Saptiva Turbo",
    temperature: 0.7,
    systemPrompt:
      "Eres un asistente AI que responde preguntas basándose en los documentos proporcionados. Utiliza la información de las fuentes para dar respuestas precisas.",
  });

  // Cargar configuraciones guardadas al montar el componente
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Intentar cargar desde la API
        const response = await fetch("/api/settings?key=modelSettings");

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setModelSettings(data.data);
            console.log("Configuración del chat cargada desde la API");
          }
        } else {
          // Fallback a localStorage
          console.warn(
            "No se pudo cargar la configuración desde la API, usando localStorage como fallback",
          );
          const storedSettings = localStorage.getItem("modelSettings");
          if (storedSettings) {
            setModelSettings(JSON.parse(storedSettings));
          }
        }
      } catch (error) {
        console.error("Error al cargar configuraciones:", error);
        // Intentar fallback a localStorage
        try {
          const storedSettings = localStorage.getItem("modelSettings");
          if (storedSettings) {
            setModelSettings(JSON.parse(storedSettings));
          }
        } catch (e) {
          console.error("Error al cargar desde localStorage:", e);
        }
      }
    };

    fetchSettings();

    // Escuchar cambios en las configuraciones del modelo
    const handleSettingsChange = (e: CustomEvent) => {
      setModelSettings(e.detail);
    };

    // Escuchar también eventos de localStorage como fallback
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "modelSettings") {
        try {
          const newSettings = JSON.parse(e.newValue || "");
          setModelSettings(newSettings);
        } catch (error) {
          console.error(
            "Error al procesar configuraciones actualizadas:",
            error,
          );
        }
      }
    };

    window.addEventListener(
      "settingsChanged",
      handleSettingsChange as EventListener,
    );
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(
        "settingsChanged",
        handleSettingsChange as EventListener,
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // Scroll al final de los mensajes cuando se añade uno nuevo
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior: "smooth"});
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // "Typing" message as placeholder
    const typingMsg: Message = {
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isTyping: true,
    };

    setMessages((prev) => [...prev, typingMsg]);

    try {
      // Scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({behavior: "smooth"});
      }, 100);

      // Comenzar con la etapa de búsqueda
      setLoadingStage("Buscando información relevante...");

      // Preparar el payload para la API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        message_id: token,
        query: input,
        modelId: modelSettings.modelId,
        temperature: modelSettings.temperature,
        systemPrompt: modelSettings.systemPrompt,
        topK: 5, // Obtener más resultados relevantes
      };

      console.log("Payload para la API:", payload);

      // Añadir namespace si está seleccionado

      // Llamada a la API para obtener respuesta del modelo
      const response = await fetch("/api/query-weaviate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error al procesar la consulta");
      }

      // Actualizar etapa de carga
      setLoadingStage("Generando respuesta...");

      const result = await response.json();

      // Eliminamos el mensaje de typing
      setMessages((prev) => prev.filter((msg) => !msg.isTyping));

      // Preparar las fuentes a partir de los matches
      const sources: Source[] = [];
      if (result.matches && result.matches.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.matches.forEach((match: any) => {
          // Extraer información adicional para mostrar metadatos más útiles
          const metadata = match.metadata || {};

          sources.push({
            name:
              metadata.sourceName ||
              metadata.filename ||
              "Documento sin nombre",
            excerpt:
              match.text || metadata.text || "No hay contenido disponible",
            relevanceScore: match.score,
            // Añadir metadatos adicionales para mostrarlos si están disponibles
            fileType: metadata.sourceType || metadata.fileType || "unknown",
            uploadDate: metadata.uploadDate || "Fecha desconocida",
            sourceId: metadata.sourceId || match.id,
          });
        });
      }

      // Mensaje de respuesta
      const assistantMessage: Message = {
        role: "assistant",
        content:
          result.answer ||
          "No se encontró información relevante para tu consulta.",
        timestamp: new Date(),
        sources: sources,
        matches: result.matches,
        modelInfo: {
          id: result.model || modelSettings.modelId,
          provider: result.provider || "Saptiva",
        },
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error procesando consulta:", error);

      // Remove typing indicator message
      setMessages((prev) => prev.filter((msg) => !msg.isTyping));

      const errorMessage: Message = {
        role: "assistant",
        content:
          "Lo siento, ocurrió un error al procesar tu consulta. Por favor, intenta de nuevo.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setLoadingStage("");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value || "");
  };

  /*const handleNamespaceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNamespace(e.target.value || "");
  };*/

  return (
    <div className="flex flex-col h-[calc(100vh-13rem)] max-w-5xl mx-auto rounded-lg border border-gray-200 overflow-hidden shadow-lg">
      {/* Historial de mensajes */}
      <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="rounded-full bg-[#e6fefb] p-3 mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-[#01f6d2]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <p className="text-lg font-medium">Comienza una conversación</p>
            <p className="text-sm mt-1">
              Haz una pregunta sobre los documentos cargados
            </p>
            <p className="text-xs mt-3 text-gray-800">
              Usando modelo:{" "}
              <span className="font-medium">{modelSettings.modelId}</span>{" "}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-3/4 p-4 rounded-lg ${
                    message.role === "user"
                      ? "bg-[#d0fffa] text-black font-medium"
                      : message.isTyping
                      ? "bg-white border border-gray-200 text-gray-800 animate-pulse"
                      : "bg-white border border-gray-200 text-gray-800"
                  }`}
                >
                  {message.isTyping ? (
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                        style={{animationDelay: "0ms"}}
                      ></div>
                      <div
                        className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                        style={{animationDelay: "150ms"}}
                      ></div>
                      <div
                        className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                        style={{animationDelay: "300ms"}}
                      ></div>
                      <span className="ml-2 text-sm text-gray-600">
                        {loadingStage}
                      </span>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap mb-1">
                      {message.content}
                    </div>
                  )}

                  {/* Información del modelo */}
                  {message.role === "assistant" &&
                    !message.isTyping &&
                    message.modelInfo && (
                      <div className="mt-2 pt-1 border-t border-gray-200">
                        <p className="text-xs text-gray-500 flex justify-between">
                          <span>Generado por {modelSettings.modelId}</span>
                          {/*message.matches && (
                            <span>
                              {message.matches.length} coincidencias encontradas
                            </span>
                          )*/}
                        </p>
                      </div>
                    )}

                  {/* Fuentes citadas con mejor presentación */}
                  {/*message.sources &&
                    message.sources.length > 0 &&
                    !message.isTyping && (
                      <div className="mt-3 pt-2 border-t border-gray-200 space-y-2">
                        <p className="text-xs font-semibold text-black">
                          Fuentes:
                        </p>
                        <div className="max-h-60 overflow-y-auto pr-1">
                          {message.sources.map((source, i) => {
                            const cleanedExcerpt = cleanSourceText(
                              source.excerpt,
                            );
                            const hasUsefulContent =
                              cleanedExcerpt !==
                              "Contenido no disponible en formato legible";

                            // Calcular el porcentaje de relevancia para la barra de progreso
                            const relevancePercent = source.relevanceScore
                              ? Math.round(source.relevanceScore * 100)
                              : 0;

                            return (
                              <div
                                key={i}
                                className="text-xs bg-gray-100 p-3 rounded mb-2 border-l-4 border-teal-400"
                              >
                                <div className="flex justify-between items-start mb-1">
                                  <p className="font-medium text-black">
                                    {source.name}
                                  </p>
                                  {source.fileType && (
                                    <span className="bg-gray-200 px-2 py-0.5 rounded text-xs text-gray-700">
                                      {source.fileType}
                                    </span>
                                  )}
                                </div>

                                {hasUsefulContent ? (
                                  <div className="mt-1 text-black bg-white p-2 rounded border border-gray-200 max-h-32 overflow-y-auto">
                                    {cleanedExcerpt}
                                  </div>
                                ) : (
                                  <p className="text-gray-600 italic mt-1 bg-white p-2 rounded border border-gray-200">
                                    Este fragmento del documento contiene
                                    formato no legible. Consulta el documento
                                    original para ver esta sección.
                                  </p>
                                )}

                                {source.relevanceScore !== undefined && (
                                  <div className="mt-2">
                                    <div className="flex items-center">
                                      <span className="text-xs text-gray-700 mr-2">
                                        Relevancia:
                                      </span>
                                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                        <div
                                          className="bg-teal-500 h-1.5 rounded-full"
                                          style={{
                                            width: `${relevancePercent}%`,
                                          }}
                                        ></div>
                                      </div>
                                      <span className="ml-2 text-xs font-medium text-gray-700">
                                        {relevancePercent}%
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {source.uploadDate && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Subido:{" "}
                                    {new Date(
                                      source.uploadDate,
                                    ).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )*/}

                  {!message.isTyping && (
                    <div className="text-xs opacity-70 mt-1 text-right">
                      {new Intl.DateTimeFormat("es", {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(message.timestamp)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Campo de entrada para nuevas preguntas */}
      <div className="mt-4 relative">
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={input || ""}
            onChange={handleInputChange}
            placeholder={`Haz una pregunta...`}
            className="w-full p-4 pr-24 border border-gray-300 rounded-lg focus:ring-[#01f6d2] focus:border-[#01f6d2] bg-white text-black placeholder-gray-600"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <button
            type="submit"
            className="absolute right-2.5 bottom-2.5 px-4 py-2 text-black bg-[#01f6d2] hover:bg-teal-400 rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed"
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-1"></div>
                <span>...</span>
              </div>
            ) : (
              "Enviar"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
