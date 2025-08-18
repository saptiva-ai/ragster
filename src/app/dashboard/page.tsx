"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Message } from "@/types/messages";
import { ChatBubbleLeftIcon, ClockIcon } from "@heroicons/react/24/outline";
import ExportConversationsButton from "@/components/ExportConversationsButton";


// Intervalo de actualización en milisegundos (10 segundos)
const REFRESH_INTERVAL = 10000;

export default function DashboardPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Función para obtener mensajes que se puede usar con useCallback
  const fetchMessages = useCallback(async () => {
    // Solo mostrar indicador de carga en la carga inicial
    if (messages.length === 0) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch("/api/messages");

      if (!response.ok) {
        throw new Error(
          `Error ${response.status}: No se pudieron cargar los mensajes`,
        );
      }

      const data = await response.json();

      if (!data.success || !data.messages) {
        throw new Error("Formato de respuesta inválido");
      }

      setMessages(data.messages);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching messages:", error);
      setError(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setIsLoading(false);
    }
  }, [messages.length]);

  // Efecto para cargar los mensajes inicialmente
  useEffect(() => {
    fetchMessages();

    // Configurar intervalo para actualización periódica
    const intervalId = setInterval(() => {
      fetchMessages();
    }, REFRESH_INTERVAL);

    // Limpiar el intervalo cuando el componente se desmonte
    return () => clearInterval(intervalId);
  }, [fetchMessages]);

  // Agrupar mensajes por message_id (conversación)
  const conversationsById: Record<string, Message[]> = messages.reduce(
    (acc, message) => {
      const id = message.message_id;
      if (!acc[id]) {
        acc[id] = [];
      }
      acc[id].push(message);
      return acc;
    },
    {} as Record<string, Message[]>,
  );

  // Crear lista de conversaciones
  const conversationList = Object.entries(conversationsById).map(
    ([message_id, messages]) => {
      // Ordenar por timestamp (más reciente primero)
      const sortedMessages = [...messages].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      // Obtener el primer y último mensaje de la conversación
      const latestMessage = sortedMessages[0];
      const firstMessage = sortedMessages[sortedMessages.length - 1];

      // Encontrar el último mensaje del usuario (para mostrar la última consulta)
      const lastUserMessage = sortedMessages.find(
        (msg) => msg.message_role === "user",
      );

      // Encontrar el último mensaje del asistente (para mostrar la última respuesta)
      const lastAssistantMessage = sortedMessages.find(
        (msg) => msg.message_role === "assistant",
      );

      // Contar mensajes por tipo
      const userMessages = messages.filter(
        (msg) => msg.message_role === "user",
      ).length;
      const assistantMessages = messages.filter(
        (msg) => msg.message_role === "assistant" && msg.message.trim() !== "",
      ).length;

      return {
        id: message_id,
        firstMessage: firstMessage.message,
        lastQuery: lastUserMessage ? lastUserMessage.message : "",
        lastResponse:
          lastAssistantMessage && lastAssistantMessage.message.trim() !== ""
            ? lastAssistantMessage.message
            : "",
        messageCount: messages.length,
        userMessages,
        assistantMessages,
        lastUpdated: latestMessage.timestamp,
        model: latestMessage.model || "N/A",
        createdAt: firstMessage.timestamp,
        userId: messages[0].message_id || "Unknown User",
        userName: lastUserMessage?.contact_name?.trim() || null


      };
    },
  );

  // Ordenar conversaciones por fecha (más reciente primero)
  const sortedConversations = [...conversationList].sort(
    (a, b) =>
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
  );

  // Formatear fecha
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
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

  return (
    <main className="container mx-auto px-4 py-8">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <nav className="flex mt-2">
            <Link href="/" className="text-blue-600 hover:underline">
              Inicio
            </Link>
            <span className="mx-2 text-gray-400">/</span>
            <span className="text-gray-700">Dashboard</span>
          </nav>
        </div>
        <ExportConversationsButton />
      </header>

      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            Conversaciones recientes
          </h2>

          <div className="flex items-center">
            <span className="text-sm text-gray-500 mr-3">
              {Object.keys(conversationsById).length} conversaciones
            </span>
            <span className="text-xs text-gray-400">
              Actualizado {getTimeAgo(lastUpdated.toISOString())}
            </span>
            <button
              onClick={() => fetchMessages()}
              className="ml-2 p-1 text-[#01f6d2] hover:text-blue-700 text-sm"
              disabled={isLoading}
            >
              Actualizar
            </button>
          </div>
        </div>

        {isLoading && messages.length === 0 ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#01f6d2]"></div>
            <span className="ml-3 text-lg text-gray-700">
              Cargando conversaciones...
            </span>
          </div>
        ) : error ? (
          <div className="text-center p-8">
            <div className="text-red-500 mb-4">
              <h3 className="text-lg font-semibold mt-2">
                Error al cargar conversaciones
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
        ) : sortedConversations.length === 0 ? (
          <div className="text-center p-8">
            <ChatBubbleLeftIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">
              No hay conversaciones disponibles
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              No se encontraron mensajes en la base de datos.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {isLoading && messages.length > 0 && (
              <div className="text-center py-2 bg-blue-50 mb-4 rounded">
                <span className="text-blue-600 text-sm">
                  Actualizando datos...
                </span>
              </div>
            )}
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nombre / Identificador
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pregunta y Respuesta
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mensajes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Último contacto
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedConversations.map((conversation) => (
                  <tr key={conversation.id} className="hover:bg-gray-50">
                    {/* Contacto */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex flex-col">
                        <span className="font-semibold">{conversation.userName}</span>
                        <span className="text-xs text-gray-500 truncate max-w-[100px]">{conversation.userId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-start">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {conversation.lastQuery.slice(0, 100)}
                            {conversation.lastQuery.length > 100 ? "..." : ""}
                          </p>
                          {conversation.lastResponse && (
                            <p className="text-xs text-gray-500 mt-1 italic">
                              {conversation.lastResponse.slice(0, 80)}
                              {conversation.lastResponse.length > 80
                                ? "..."
                                : ""}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-2 flex items-center">
                            <ChatBubbleLeftIcon className="h-3 w-3 mr-1" />
                            <span title="Mensajes de usuario">
                              {conversation.userMessages} usuario
                            </span>
                            <span className="mx-1">·</span>
                            <span title="Mensajes del asistente">
                              {conversation.assistantMessages} asistente
                            </span>
                            <span className="mx-1">·</span>
                            <span>ID: {conversation.id.slice(0, 8)}...</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {conversation.messageCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex flex-col">
                        <div className="flex items-center text-xs text-gray-500">
                          <ClockIcon className="h-3 w-3 mr-1 text-gray-400" />
                          Hace {getTimeAgo(conversation.lastUpdated)}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {formatDate(conversation.lastUpdated)}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          Creado: {formatDate(conversation.createdAt)}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link
                        href={`/dashboard/conversations/${conversation.id}`}
                        className="text-[#01f6d2] hover:text-blue-900"
                      >
                        Ver detalles
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
