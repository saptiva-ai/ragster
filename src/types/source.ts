export interface Source {
  id: string;
  name: string;
  type: string;  // puede ser 'pdf', 'docx', 'text', 'url', etc.
  size: string;
  uploadDate: string;
  chunkCount: number;
  url?: string;    // opcional para fuentes de tipo URL
} 