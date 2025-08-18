'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ArrowUpTrayIcon, DocumentTextIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

type FileUploadProps = {
  onFilesUploaded: (files: File[]) => void;
  isProcessing: boolean;
};

export default function FileUpload({ onFilesUploaded, isProcessing }: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setUploadedFiles(acceptedFiles);
    onFilesUploaded(acceptedFiles);
  }, [onFilesUploaded]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    disabled: isProcessing,
    multiple: true
  });

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div 
        {...getRootProps()} 
        className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
          isDragActive 
            ? 'border-[#01f6d2] bg-[#e6fefb]' 
            : 'border-gray-300 hover:bg-gray-50'
        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="p-3 rounded-full bg-[#e6fefb]">
            <ArrowUpTrayIcon className="h-6 w-6 text-[#01f6d2]" />
          </div>
          <div>
            <p className="text-lg font-medium text-black">
              {isDragActive ? 'Suelta tus archivos aquí' : 'Arrastra y suelta tus documentos'}
            </p>
            <p className="text-sm text-black">
              o haz clic para seleccionar archivos (PDF, TXT, DOCX)
            </p>
          </div>
        </div>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mt-4">
          <h3 className="text-md font-medium mb-2 text-black">Archivos seleccionados:</h3>
          <ul className="space-y-2">
            {uploadedFiles.map((file, index) => (
              <li key={index} className="flex items-center p-2 bg-gray-50 rounded-md">
                <DocumentTextIcon className="h-5 w-5 text-[#01f6d2] mr-2" />
                <span className="text-sm text-black">{file.name}</span>
                {isProcessing && (
                  <div className="ml-auto flex items-center">
                    <div className="animate-spin h-4 w-4 border-2 border-[#01f6d2] border-t-transparent rounded-full mr-2"></div>
                    <span className="text-xs text-black font-medium">Procesando...</span>
                  </div>
                )}
                {!isProcessing && uploadedFiles.length > 0 && (
                  <CheckCircleIcon className="h-5 w-5 text-green-500 ml-auto" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
} 