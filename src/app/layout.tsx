import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import DynamicFavicon from "@/components/DynamicFavicon";
import {Providers} from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Saptiva - Intelligent Document Processing",
  description: "Plataforma de inteligencia artificial para el procesamiento, análisis y gestión de documentos empresariales con RAG.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <DynamicFavicon />
      </head>
      <body className={`${inter.className} bg-white`}>
        <Providers>
          <Navbar />
          <div className="min-h-[calc(100vh-4rem)]">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
