import {useState} from "react";
import {
  WeaviateRecord,
  updateWeaviateRecord,
  deleteWeaviateRecord,
} from "@/lib/services/weaviate";

interface WeaviateRecordDetailsProps {
  record: WeaviateRecord;
  onClose: () => void;
  onRefresh: () => void;
}

export default function WeaviateRecordDetails({
  record,
  onClose,
  onRefresh,
}: WeaviateRecordDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProperties, setEditedProperties] = useState<
    Record<string, string | number | boolean | null>
  >({});
  const [error, setError] = useState<string | null>(null);

  const handleEdit = () => {
    setEditedProperties({...record.properties});
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      await updateWeaviateRecord(record.id, editedProperties);
      setIsEditing(false);
      onRefresh();
      setError(null);
    } catch (err) {
      setError("Error al actualizar el registro");
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este registro?")) {
      try {
        await deleteWeaviateRecord(record.id);
        onClose();
        onRefresh();
        setError(null);
      } catch (err) {
        setError("Error al eliminar el registro");
        console.error(err);
      }
    }
  };

  const renderField = (key: string, value: string | null) => {
    if (isEditing && key === "text") {
      return (
        <div className="relative">
          <textarea
            value={value as string}
            onChange={(e) =>
              setEditedProperties({
                ...editedProperties,
                [key]: e.target.value,
              })
            }
            rows={6}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm pl-3 pr-10 py-2"
            placeholder="Ingrese el texto"
          />
        </div>
      );
    }

    return (
      <div className="bg-gray-50 p-2 rounded border border-gray-200">
        <span className="text-sm text-gray-900 whitespace-pre-wrap">
          {value as string}
        </span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900/90 to-indigo-900/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">
                Detalles del Registro
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Visualice y edite la información del registro
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 transition-colors duration-200"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md border border-red-200">
              {error}
            </div>
          )}

          <div className="space-y-6">
            <div className="bg-gradient-to-r from-gray-50 to-indigo-50 p-4 rounded-lg border border-gray-200">
              <label className="block text-sm font-medium text-gray-700">
                ID
              </label>
              <div className="mt-1 text-sm text-gray-900 font-mono bg-white/80 p-2 rounded border border-gray-200">
                {record.id}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-gray-200 overflow-hidden shadow-sm">
              <div className="bg-gradient-to-r from-gray-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-700">
                  Propiedades
                </h3>
              </div>
              <div className="p-4 space-y-4">
                {Object.entries(
                  isEditing ? editedProperties : record.properties,
                ).map(([key, value]) => (
                  <div key={key} className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      {key}
                    </label>
                    {renderField(key, value !== null ? String(value) : null)}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              {!isEditing ? (
                <>
                  <button
                    onClick={handleEdit}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                  >
                    <svg
                      className="h-4 w-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Editar Texto
                  </button>
                  <button
                    onClick={handleDelete}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200"
                  >
                    <svg
                      className="h-4 w-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    Eliminar
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                  >
                    <svg
                      className="h-4 w-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200"
                  >
                    <svg
                      className="h-4 w-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Guardar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
