"use client";

import { useState, useEffect } from "react";

// Define Lead interface
interface Lead {
  id: string;
  whatsappName: string;
  phoneNumber: string;
  registrationDate: string;
  status: string;
}

export default function LeadsTable() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/leads");
        const data = await res.json();
        if (data.success) {
          setLeads(data.leads);
        } else {
          setError(data.error || "Error desconocido");
        }
      } catch (err) {
        setError("Error al cargar los datos: " + 
          (err instanceof Error ? err.message : "Error desconocido"));
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, []);

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      
      const data = await res.json();
      
      if (data.success) {
        setLeads(leads.map(lead => 
          lead.id === id ? {...lead, status} : lead
        ));
      } else {
        alert("Error al actualizar");
      }
    } catch (err) {
      console.error(err);
      alert("Error en la solicitud");
    } finally {
      setUpdatingId(null);
    }
  }

  function viewDetails(id: string) {
    window.location.href = `/dashboard/leads/${id}`;
  }

  function formatDate(dateString: string) {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es', {
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric'
      });
    } catch {
      return "Fecha desconocida";
    }
  }

  if (loading) return <div className="text-center p-4">Cargando...</div>;
  if (error) return (
    <div className="text-center text-red-500 p-4">
      <p>{error}</p>
      {error.includes('MongoDB') && (
        <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <p className="text-yellow-800 text-sm">
            <strong>Conexión a MongoDB requerida:</strong> Esta funcionalidad necesita una conexión a MongoDB.
          </p>
          <ul className="list-disc list-inside text-sm text-yellow-700 mt-2">
            <li>Verifica que MongoDB esté instalado y funcionando</li>
            <li>Configura la variable de entorno MONGODB_URI en el archivo .env.local</li>
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Nombre</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Teléfono</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Registro</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Estado</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Acciones</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {leads.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-3 text-center">No hay leads disponibles</td>
            </tr>
          ) : (
            leads.map(lead => (
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap font-medium">{lead.whatsappName}</td>
                <td className="px-4 py-3 whitespace-nowrap">{lead.phoneNumber}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(lead.registrationDate)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <select 
                    value={lead.status}
                    onChange={(e) => updateStatus(lead.id, e.target.value)}
                    disabled={updatingId === lead.id}
                    className="border p-1 rounded"
                  >
                    <option value="new">Nuevo</option>
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                  {updatingId === lead.id && <span className="ml-2">⌛</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button 
                    onClick={() => viewDetails(lead.id)}
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Ver mensajes
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
} 