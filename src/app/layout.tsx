import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import DynamicFavicon from "@/components/DynamicFavicon";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RAG Playground - Consultas sobre documentos vectorizados",
  description: "Plataforma para procesamiento de documentos, vectorización y consultas RAG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <DynamicFavicon />
      </head>
      <body className={`${inter.className} bg-white`}>
        <Navbar />
        <div className="min-h-[calc(100vh-4rem)]">
          {children}
        </div>
      </body>
    </html>
  );
}
