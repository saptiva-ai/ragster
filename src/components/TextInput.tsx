'use client';

import { useState } from 'react';

type TextInputProps = {
  onTextUploaded: (text: string) => Promise<void>;
  isProcessing: boolean;
};

export default function TextInput({ onTextUploaded, isProcessing }: TextInputProps) {
  const [text, setText] = useState<string>('');
  const [name, setName] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !name.trim()) return;
    
    await onTextUploaded(JSON.stringify({ text, name }));
    // Limpiar formulario después de éxito
    setText('');
    setName('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="textName" className="block text-sm font-bold text-black mb-1">
          Nombre del documento
        </label>
        <input
          type="text"
          id="textName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Notas de reunión"
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-[#01f6d2] focus:border-[#01f6d2] text-gray-800"
          disabled={isProcessing}
        />
      </div>
      
      <div>
        <label htmlFor="textContent" className="block text-sm font-bold text-black mb-1">
          Texto
        </label>
        <textarea
          id="textContent"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pega aquí el texto que quieres procesar..."
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-[#01f6d2] focus:border-[#01f6d2] text-gray-800"
          disabled={isProcessing}
        />
      </div>
      
      <button
        type="submit"
        disabled={isProcessing || !text.trim() || !name.trim()}
        className={`px-4 py-2 rounded-md ${
          isProcessing || !text.trim() || !name.trim()
            ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-[#01f6d2] hover:bg-[#00d9b9] text-white'
        }`}
      >
        {isProcessing ? (
          <div className="flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            <span>Procesando...</span>
          </div>
        ) : (
          'Procesar texto'
        )}
      </button>
    </form>
  );
} 