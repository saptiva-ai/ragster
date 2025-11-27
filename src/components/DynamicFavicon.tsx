'use client';

import { useEffect } from 'react';

export default function DynamicFavicon() {
  useEffect(() => {
    // Actualizar el favicon con el ícono predeterminado
    const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    link.setAttribute('rel', 'shortcut icon');
    link.setAttribute('href', '/logo.png');
    document.getElementsByTagName('head')[0].appendChild(link);
  }, []);

  // Este componente no renderiza nada, solo modifica el favicon
  return null;
} 