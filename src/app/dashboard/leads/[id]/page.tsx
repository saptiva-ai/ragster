"use client";

import {useState, useEffect} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {ArrowLeftIcon, ClockIcon} from "@heroicons/react/24/outline";
import {Message, Lead} from "@/types/messages";

// Interface para los datos de leads y mensajes
// Usamos las interfaces importadas, no necesitamos redefinirlas

export default function LeadDetailPage() {
  const {id} = useParams<{id: string}>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cargar datos del lead y sus mensajes
  useEffect(() => {
    const fetchLeadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Obtener datos del lead
        const leadResponse = await fetch(`/api/leads/${id}`);

        if (!leadResponse.ok) {
          throw new Error(
            `Error ${leadResponse.status}: No se pudo cargar la información del lead`,
          );
        }

        const leadData = await leadResponse.json();

        if (!leadData.success || !leadData.lead) {
          throw new Error("Datos de lead no válidos");
        }

        setLead(leadData.lead);

        // Obtener mensajes del lead
        const messagesResponse = await fetch(`/api/leads/messages/${id}`);

        if (!messagesResponse.ok) {
          throw new Error(
            `Error ${messagesResponse.status}: No se pudieron cargar los mensajes`,
          );
        }

        const messagesData = await messagesResponse.json();

        if (!messagesData.success) {
          throw new Error("Datos de mensajes no válidos");
        }

        // Ordenar mensajes por timestamp
        const sortedMessages = messagesData.messages.sort(
          (a: Message, b: Message) => {
            return (
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
          },
        );

        setMessages(sortedMessages);
      } catch (error) {
        console.error("Error fetching lead data:", error);
        setError(
          error instanceof Error
            ? `Error de conexión: ${error.message}`
            : "Error al conectar con la base de datos",
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchLeadData();
    }
  }, [id]);

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

  // Determinar clase CSS basada en el rol del mensaje
  const getMessageClass = (role: string) => {
    switch (role.toLowerCase()) {
      case "user":
        return "bg-blue-50 border-blue-200";
      case "assistant":
        return "bg-green-50 border-green-200";
      case "system":
        return "bg-gray-50 border-gray-200";
      default:
        return "bg-gray-50 border-gray-200";
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
          <h1 className="text-2xl font-bold text-gray-900">
            Detalle de Conversación
          </h1>
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

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-lg text-gray-700">Cargando datos...</span>
        </div>
      ) : error ? (
        <div className="text-center p-8 bg-white rounded-lg shadow-lg">
          <div className="text-red-500 mb-4">
            <h3 className="text-lg font-semibold mt-2">
              Error al cargar datos
            </h3>
            <p className="text-sm mt-1 text-gray-700">{error}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Intentar de nuevo
          </button>
        </div>
      ) : (
        <>
          {/* Información del lead */}
          {lead && (
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-900">
                Información del Lead
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Nombre:</p>
                  <p className="text-base font-medium">{lead.whatsappName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Teléfono:</p>
                  <p className="text-base font-medium">{lead.phoneNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fecha de registro:</p>
                  <p className="text-base font-medium">
                    {formatDate(lead.registrationDate)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Estado:</p>
                  <span
                    className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      lead.status === "active"
                        ? "bg-green-100 text-green-800"
                        : lead.status === "inactive"
                        ? "bg-gray-100 text-gray-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {lead.status === "active"
                      ? "Activo"
                      : lead.status === "inactive"
                      ? "Inactivo"
                      : "Nuevo"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Mensajes */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">
              Mensajes
            </h2>

            {messages.length === 0 ? (
              <div className="text-center p-8 text-gray-500">
                No hay mensajes disponibles
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.message_id}
                    className={`border rounded-lg p-4 ${getMessageClass(
                      message.message_role,
                    )}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-gray-700">
                        {translateRole(message.message_role)}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        {formatDate(message.timestamp)}
                      </span>
                    </div>
                    <p className="text-gray-800 whitespace-pre-wrap">
                      {message.message}
                    </p>
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                      <span className="mr-3">Modelo: {message.model}</span>
                      <span className="mr-3">Temp: {message.temperature}</span>
                      <span>Max Tokens: {message.max_tokens}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
