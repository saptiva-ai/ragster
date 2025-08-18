import { useState, useEffect } from 'react';
import { getWeaviateRecords, WeaviateRecord } from '@/lib/services/weaviate';
import WeaviateRecordsTable from './WeaviateRecordsTable';
import {
  ArrowPathIcon,

} from "@heroicons/react/24/outline";

export default function WeaviateRecords() {
  const [records, setRecords] = useState<WeaviateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const data = await getWeaviateRecords();
      setRecords(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching records:', err);
      setError('Error al cargar los registros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#01f6d2]"></div>
            <span className="ml-3 text-lg text-gray-700">
              Cargando registros...
            </span>
          </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-4">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchRecords}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
        <header className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-[#01f6d2]">
            Registros
          </h1>
          <div className="flex space-x-2">
            <button
              onClick={fetchRecords}
              className="flex items-center justify-center p-2 bg-white text-[#01f6d2] rounded-full hover:bg-gray-100 border border-[#01f6d2]"
              title="Actualizar lista"
            >
              <ArrowPathIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>
      
      <WeaviateRecordsTable records={records} onRefresh={fetchRecords} />
    </div>
  );
} 