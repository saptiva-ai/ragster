'use client';

import { useState, useEffect } from 'react';
import { DocumentTextIcon, GlobeAltIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Source } from '@/types/source';

interface SourcesListProps {
  initialSources?: Source[];
  onDelete?: (id: string) => void;
}

export default function SourcesList({ initialSources, onDelete }: SourcesListProps) {
  const [sources, setSources] = useState<Source[]>(initialSources || []);

  useEffect(() => {
    if (initialSources) {
      setSources(initialSources);
    }
  }, [initialSources]);

  const getFileIcon = (fileType: string) => {
    if (fileType === 'url') {
      return <GlobeAltIcon className="h-5 w-5 text-blue-500" />;
    } else if (fileType === 'text') {
      return <DocumentTextIcon className="h-5 w-5 text-[#01f6d2]" />;
    } else if (fileType.includes('pdf')) {
      return <DocumentTextIcon className="h-5 w-5 text-red-500" />;
    } else if (fileType.includes('word') || fileType.includes('docx')) {
      return <DocumentTextIcon className="h-5 w-5 text-blue-500" />;
    } else if (fileType.includes('text')) {
      return <DocumentTextIcon className="h-5 w-5 text-gray-500" />;
    } else {
      return <DocumentTextIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const handleDelete = (id: string) => {
    if (onDelete) {
      onDelete(id);
    }
    setSources(sources.filter(source => source.id !== id));
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-medium text-gray-900">Fuentes Incluidas</h2>
          <p className="mt-1 text-sm text-black">
            Documentos procesados y disponibles para consulta
          </p>
        </div>
        
        {sources.length === 0 ? (
          <div className="p-8 text-center text-black">
            <p className="text-lg font-medium">Vacío</p>
            <p className="mt-1 text-sm">No hay documentos cargados en el sistema</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {sources.map((source) => (
              <li key={source.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center min-w-0">
                  <div className="flex-shrink-0">
                    {getFileIcon(source.type)}
                  </div>
                  <div className="ml-4 truncate">
                    <p className="text-sm font-medium text-gray-900 truncate">{source.name}</p>
                    <div className="flex items-center text-xs text-black mt-1">
                      <span className="font-medium">{source.size}</span>
                      <span className="mx-1">•</span>
                      <span>{new Date(source.uploadDate).toLocaleDateString('es')}</span>
                      <span className="mx-1">•</span>
                      <span className="font-medium">{source.chunkCount} chunks</span>
                      {source.url && (
                        <>
                          <span className="mx-1">•</span>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            Ver original
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(source.id)}
                  className="ml-4 p-2 text-red-500 hover:bg-red-50 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  title="Eliminar fuente"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
} 