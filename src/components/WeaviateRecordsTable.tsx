import { useState, useMemo } from "react";
import { WeaviateRecord } from "@/lib/services/weaviate";
import WeaviateRecordDetails from "./WeaviateRecordDetails";
import TablePagination from "./TablePagination";

interface WeaviateRecordsTableProps {
  records: WeaviateRecord[];
  onRefresh: () => void;
}

export default function WeaviateRecordsTable({
  records,
  onRefresh,
}: WeaviateRecordsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<WeaviateRecord | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newText, setNewText] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const itemsPerPage = 20;

  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const query = searchQuery.toLowerCase();
    return records.filter(
      (record) =>
        typeof record.properties.text === "string" &&
        record.properties.text.toLowerCase().includes(query)
    );
  }, [records, searchQuery]);

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentRecords = filteredRecords.slice(startIndex, endIndex);

  const handleRowClick = (record: WeaviateRecord) => {
    setSelectedRecord(record);
  };

  const handleCloseDetails = () => {
    setSelectedRecord(null);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleAddRecord = async () => {
    setIsAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/records-weaviate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newText }),
      });
      if (!res.ok) throw new Error("Error al crear el registro");
      setShowAddModal(false);
      setNewText("");
      onRefresh();
    } catch (err) {
      console.error("Error al crear el registro:", err);
      setAddError("No se pudo crear el registro");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      {/* Search Bar y Botón Añadir */}
      <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="relative w-full sm:w-1/2">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Buscar en el contenido..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#01f6d2] focus:border-transparent text-sm"
          />
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-[#01f6d2] hover:bg-[#00cbb0] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#01f6d2] transition-colors duration-200"
        >
          <svg
            className="h-5 w-5 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Añadir registro
        </button>
      </div>

      {/* Modal para añadir registro */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100/90 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
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
            <h2 className="text-lg font-semibold mb-4 text-gray-900">
              Añadir nuevo registro
            </h2>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Texto
            </label>
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={4}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-[#01f6d2] focus:ring-[#01f6d2] sm:text-sm mb-4"
              placeholder="Ingrese el texto del registro"
            />
            {addError && (
              <div className="mb-2 text-red-600 text-sm">{addError}</div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200 text-sm"
                disabled={isAdding}
              >
                Cancelar
              </button>
              <button
                onClick={handleAddRecord}
                className="px-4 py-2 rounded-md text-white bg-[#01f6d2] hover:bg-[#00cbb0] text-sm font-medium"
                disabled={isAdding || !newText.trim()}
              >
                {isAdding ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {filteredRecords.length === 0 ? (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No se encontraron registros
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery
              ? "No hay resultados que coincidan con tu búsqueda. Intenta con otros términos."
              : "No se encontraron registros en Weaviate. Intente cargar algunos documentos primero."}
          </p>
          <div className="mt-6">
            <button
              onClick={() => {
                setSearchQuery("");
                onRefresh();
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-[#01f6d2] hover:bg-[#00cbb0] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#01f6d2] transition-colors duration-200"
            >
              <svg
                className="-ml-1 mr-2 h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {searchQuery ? "Limpiar búsqueda" : "Actualizar"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-[#f7faf9] text-xs text-gray-500 uppercase">
                  <th className="px-6 py-3 text-left font-semibold tracking-wider rounded-tl-xl">
                    ÚLTIMA CONSULTA
                  </th>
                  <th className="px-6 py-3 text-right font-semibold tracking-wider rounded-tr-xl">
                    ACCIONES
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentRecords.map((record, idx) => {
                  const isFirst = idx === 0;
                  return (
                    <tr
                      key={record.id}
                      className={`${
                        isFirst ? "bg-[#f7faf9]" : "bg-white"
                      } border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150`}
                    >
                      <td className="px-6 py-4 align-top w-1/2">
                        <div className="font-semibold text-gray-900 truncate">
                          {typeof record.properties.text === "string"
                            ? record.properties.text
                                .split("\n")[0]
                                .slice(0, 130)
                            : "Sin texto"}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 truncate">
                          {typeof record.properties.text === "string"
                            ? record.properties.text
                                .split("\n")
                                .slice(1)
                                .join(" ")
                                .slice(0, 180)
                            : ""}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                          <span>
                            <svg
                              className="inline h-4 w-4 mr-1"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5.121 17.804A13.937 13.937 0 0112 15c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                            ID: {record.id.slice(0, 12)}...
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top text-right">
                        <button
                          onClick={() => handleRowClick(record)}
                          className="text-[#01f6d2] hover:text-[#00cbb0] hover:underline font-medium text-sm transition-colors duration-200"
                        >
                          Ver detalles
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-gray-100">
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredRecords.length}
              itemsPerPage={itemsPerPage}
            />
          </div>
        </>
      )}
      {selectedRecord && (
        <WeaviateRecordDetails
          record={selectedRecord}
          onClose={handleCloseDetails}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
