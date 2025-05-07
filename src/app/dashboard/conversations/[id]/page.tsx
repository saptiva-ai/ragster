"use client";

import {useState, useEffect, useCallback} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {
  ArrowLeftIcon,
  ClockIcon,
  UserIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import {Message} from "@/types/messages";

// Intervalo de actualización en milisegundos (10 segundos)
const REFRESH_INTERVAL = 10000;

export default function ConversationPage() {
  const {id} = useParams<{id: string}>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Cargar los mensajes de esta conversación
  const fetchMessages = useCallback(async () => {
    if (messages.length === 0) {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Usar el nuevo endpoint específico para esta conversación
      const response = await fetch(`/api/messages/${id}`);

      if (!response.ok) {
        throw new Error(
          `Error ${response.status}: No se pudieron cargar los mensajes`,
        );
      }

      const data = await response.json();

      if (!data.success || !data.messages) {
        throw new Error("Formato de respuesta inválido");
      }

      // Ordenar por timestamp (del más antiguo al más reciente)
      const sortedMessages = [...data.messages].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      setMessages(sortedMessages);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching messages:", error);
      setError(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setIsLoading(false);
    }
  }, [id, messages.length]);

  useEffect(() => {
    if (id) {
      fetchMessages();

      // Configurar intervalo para actualización periódica
      const intervalId = setInterval(() => {
        fetchMessages();
      }, REFRESH_INTERVAL);

      // Limpiar el intervalo cuando el componente se desmonte
      return () => clearInterval(intervalId);
    }
  }, [id, fetchMessages]);

  // Formatear fecha
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  };

  // Log de mensajes para depuración
  useEffect(() => {
    if (messages.length > 0) {
      console.log(
        `Página - Conversación ${id} tiene ${messages.length} mensajes:`,
      );
      messages.forEach((msg, i) => {
        console.log(
          `${i + 1}. ${msg.message_role}: ${msg.message.substring(0, 30)}${
            msg.message.length > 30 ? "..." : ""
          }`,
        );
      });
    }
  }, [messages, id]);

  // Determinar clase CSS basada en el rol del mensaje
  const getMessageClass = (role: string) => {
    switch (role.toLowerCase()) {
      case "user":
        return "bg-blue-50 border-blue-200 ml-auto";
      case "assistant":
        return "bg-green-50 border-green-200 mr-auto";
      case "system":
        return "bg-gray-50 border-gray-200 mx-auto";
      default:
        return "bg-gray-50 border-gray-200 mx-auto";
    }
  };

  // Traducir rol del mensaje
  const translateRole = (role: string) => {
    switch (role.toLowerCase()) {
      case "user":
        return "Usuario";
      case "assistant":
        return "Asistente";
      case "system":
        return "Sistema";
      default:
        return role;
    }
  };

  // Calcular tiempo transcurrido desde una fecha
  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return `${diffSecs} seg`;

    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins} min`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} h`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} d`;

    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths} meses`;

    const diffYears = Math.floor(diffMonths / 12);
    return `${diffYears} años`;
  };

  // Garantizar que haya un mensaje de asistente después de cada mensaje de usuario
  const ensureCompleteConversation = (messages: Message[]) => {
    // Devolver los mensajes sin modificar para no mostrar mensajes dummy
    return messages;
  };

  // Procesar los mensajes para garantizar que haya respuestas a cada pregunta
  // Solo si no hay respuestas explícitas del asistente
  const processedMessages = ensureCompleteConversation(messages);

  return (
    <main className="container mx-auto px-4 py-8">
      <header className="mb-6">
        <div className="flex items-center mb-4">
          <Link
            href="/dashboard"
            className="text-blue-600 hover:text-blue-800 mr-2"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Conversación</h1>
        </div>
        <nav className="flex mb-6">
          <Link href="/" className="text-blue-600 hover:underline">
            Inicio
          </Link>
          <span className="mx-2 text-gray-400">/</span>
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            Dashboard
          </Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-700">Conversación</span>
        </nav>
      </header>

      {isLoading && messages.length === 0 ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-lg text-gray-700">
            Cargando mensajes...
          </span>
        </div>
      ) : error ? (
        <div className="text-center p-8 bg-white rounded-lg shadow-lg">
          <div className="text-red-500 mb-4">
            <h3 className="text-lg font-semibold mt-2">
              Error al cargar mensajes
            </h3>
            <p className="text-sm mt-1 text-gray-700">{error}</p>
          </div>
          <button
            onClick={() => fetchMessages()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Intentar de nuevo
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="border-b pb-4 mb-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">ID: {id}</h2>
              <div className="flex items-center">
                <span className="text-sm text-gray-500 mr-3">
                  {messages.length} mensajes
                </span>
                <span className="text-xs text-gray-400">
                  Actualizado hace {getTimeAgo(lastUpdated.toISOString())}
                </span>
                <button
                  onClick={() => fetchMessages()}
                  className="ml-2 p-1 text-blue-500 hover:text-blue-700 text-sm"
                  disabled={isLoading}
                >
                  Actualizar
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {messages[0]?._id ? `Usuario: ${messages[0]._id}` : ""}
            </p>
          </div>

          {isLoading && messages.length > 0 && (
            <div className="text-center py-2 bg-blue-50 mb-4 rounded">
              <span className="text-blue-600 text-sm">
                Actualizando mensajes...
              </span>
            </div>
          )}

          <div className="space-y-6 max-w-3xl mx-auto">
            {processedMessages.map((message, index) => (
              <div
                key={message._id || `msg-${index}`}
                className={`p-4 rounded-lg border max-w-[80%] ${getMessageClass(
                  message.message_role,
                )}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm font-medium text-gray-700 flex items-center">
                    {message.message_role === "user" ? (
                      <UserIcon className="h-4 w-4 mr-1 text-blue-500" />
                    ) : (
                      <ChatBubbleLeftRightIcon className="h-4 w-4 mr-1 text-green-500" />
                    )}
                    {translateRole(message.message_role)}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center">
                    <ClockIcon className="h-3 w-3 mr-1" />
                    {formatDate(message.timestamp)}
                  </div>
                </div>

                <div className="text-gray-800 whitespace-pre-wrap">
                  {message.message || "(Sin contenido)"}
                </div>

                <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                  <span className="mr-3">Modelo: {message.model || "N/A"}</span>
                  {message.temperature !== null && (
                    <span className="mr-3">Temp: {message.temperature}</span>
                  )}
                  {message.max_tokens !== null && (
                    <span>Max Tokens: {message.max_tokens}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
