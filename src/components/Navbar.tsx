"use client";

import {useState} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {
  Bars3Icon,
  XMarkIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (path: string) => {
    return pathname === path
      ? "bg-[#01f6d2] text-black"
      : "text-gray-700 hover:bg-[#01f6d2] hover:text-black";
  };

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-between h-16">
          {/* Logo y Menú móvil */}
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link href="/" className="flex items-center">
                <span className="text-[#01f6d2] font-bold text-xl">
                  RAG Playground
                </span>
              </Link>
            </div>
            <div className="hidden md:block ml-10">
              <div className="flex space-x-4">
                <Link
                  href="/"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${isActive(
                    "/",
                  )}`}
                >
                  <div className="flex items-center">
                    <ChatBubbleLeftRightIcon className="h-5 w-5 mr-1" />
                    <span>Chat</span>
                  </div>
                </Link>
                <Link
                  href="/documents"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${isActive(
                    "/documents",
                  )}`}
                >
                  <div className="flex items-center">
                    <DocumentTextIcon className="h-5 w-5 mr-1" />
                    <span>Documentos</span>
                  </div>
                </Link>
                <Link
                  href="/dashboard"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${isActive(
                    "/dashboard",
                  )}`}
                >
                  <div className="flex items-center">
                    <ChartBarIcon className="h-5 w-5 mr-1" />
                    <span>Dashboard</span>
                  </div>
                </Link>
                <Link
                  href="/settings"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${isActive(
                    "/settings",
                  )}`}
                >
                  <div className="flex items-center">
                    <Cog6ToothIcon className="h-5 w-5 mr-1" />
                    <span>Configuración</span>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {/* Botón menú móvil */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-[#01f6d2] hover:text-black hover:bg-gray-100 focus:outline-none"
            >
              <span className="sr-only">
                {isMenuOpen ? "Cerrar menú" : "Abrir menú"}
              </span>
              {isMenuOpen ? (
                <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Menú móvil */}
      {isMenuOpen && (
        <div className="md:hidden px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t border-gray-200">
          <Link
            href="/"
            className={`block px-3 py-2 rounded-md text-base font-medium ${isActive(
              "/",
            )}`}
            onClick={() => setIsMenuOpen(false)}
          >
            <div className="flex items-center">
              <ChatBubbleLeftRightIcon className="h-5 w-5 mr-2" />
              <span>Chat</span>
            </div>
          </Link>
          <Link
            href="/documents"
            className={`block px-3 py-2 rounded-md text-base font-medium ${isActive(
              "/documents",
            )}`}
            onClick={() => setIsMenuOpen(false)}
          >
            <div className="flex items-center">
              <DocumentTextIcon className="h-5 w-5 mr-2" />
              <span>Documentos</span>
            </div>
          </Link>
          <Link
            href="/dashboard"
            className={`block px-3 py-2 rounded-md text-base font-medium ${isActive(
              "/dashboard",
            )}`}
            onClick={() => setIsMenuOpen(false)}
          >
            <div className="flex items-center">
              <ChartBarIcon className="h-5 w-5 mr-2" />
              <span>Dashboard</span>
            </div>
          </Link>
          <Link
            href="/settings"
            className={`block px-3 py-2 rounded-md text-base font-medium ${isActive(
              "/settings",
            )}`}
            onClick={() => setIsMenuOpen(false)}
          >
            <div className="flex items-center">
              <Cog6ToothIcon className="h-5 w-5 mr-2" />
              <span>Configuración</span>
            </div>
          </Link>
        </div>
      )}
    </nav>
  );
}
