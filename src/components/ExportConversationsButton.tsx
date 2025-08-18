"use client";

import React from "react";

type ExportConversationsButtonProps = {
  className?: string;
  label?: string;
};

export default function ExportConversationsButton({
  className = "px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 transition",
  label = "Descargar",
}: ExportConversationsButtonProps) {
  const handleExport = async () => {
    try {
      const res = await fetch("/api/exports/conversations", {
        method: "GET",
      });

      if (!res.ok) throw new Error("No se pudo generar el archivo");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "conversaciones.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Error al descargar el archivo");
    }
  };

  return (
    <button onClick={handleExport} className={className}>
      {label}
    </button>
  );
}
