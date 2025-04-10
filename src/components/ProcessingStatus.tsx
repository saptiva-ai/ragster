'use client';

import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

export interface ProcessingStatusProps {
  isProcessing: boolean;
  message: string;
  error: string | null;
}

export default function ProcessingStatus({ isProcessing, message, error }: ProcessingStatusProps) {
  if (!isProcessing && !message && !error) return null;

  // Determinar el estado basado en las props
  const status = isProcessing 
    ? 'processing' 
    : error 
      ? 'error' 
      : message 
        ? 'success' 
        : 'idle';

  return (
    <div className="mt-6 w-full max-w-3xl mx-auto">
      <div 
        className={`p-4 rounded-lg ${
          status === 'processing' ? 'bg-blue-50 border border-blue-200' :
          status === 'success' ? 'bg-green-50 border border-green-200' :
          'bg-red-50 border border-red-200'
        }`}
      >
        <div className="flex items-center">
          {status === 'processing' && (
            <div className="mr-3">
              <div className="animate-spin h-5 w-5 border-2 border-[#01f6d2] border-t-transparent rounded-full"></div>
            </div>
          )}
          
          {status === 'success' && (
            <CheckCircleIcon className="h-5 w-5 text-green-500 mr-3" />
          )}
          
          {status === 'error' && (
            <XCircleIcon className="h-5 w-5 text-red-500 mr-3" />
          )}
          
          <span 
            className={`font-medium ${
              status === 'processing' ? 'text-black' :
              status === 'success' ? 'text-black' :
              'text-black'
            }`}
          >
            {message}
          </span>
        </div>
        
        {status === 'error' && error && (
          <div className="mt-2 text-sm text-black whitespace-pre-wrap">
            {error}
          </div>
        )}
      </div>
    </div>
  );
} 