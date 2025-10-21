'use client';

import PlaygroundChat from '@/components/PlaygroundChat';

export default function Home() {
  return (
    <main className="py-8 px-4">
      <div className="max-w-5xl mx-auto mb-8 p-4 rounded-lg bg-white border border-[#01f6d2]">
        <p className="text-black text-base font-medium">
          Haz preguntas sobre tus documentos y obtén respuestas precisas usando RAG con búsqueda vectorial
        </p>
      </div>
      
      <PlaygroundChat />
    </main>
  );
}



