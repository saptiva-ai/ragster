"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Bars3Icon,
  XMarkIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  CircleStackIcon,
} from "@heroicons/react/24/outline";

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  const isActive = (path: string) =>
    pathname === path
      ? "bg-[#01f6d2] text-black"
      : "text-gray-700 hover:bg-[#01f6d2] hover:text-black";

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      await signOut({ callbackUrl: "/auth/signin" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex-shrink-0">
          <Link href="/" className="flex items-center">
            <span className="text-[#01f6d2] font-bold text-xl">RAGster</span>
          </Link>
        </div>

        {/* Desktop menu */}
        <div className="hidden md:flex flex-1 justify-center space-x-4">
          <Link href="/" className={`px-3 py-2 rounded-md text-sm font-medium ${isActive("/")}`}>
            <div className="flex items-center">
              <ChatBubbleLeftRightIcon className="h-5 w-5 mr-1" />
              <span>Chat</span>
            </div>
          </Link>
          <Link
            href="/documents"
            className={`px-3 py-2 rounded-md text-sm font-medium ${isActive("/documents")}`}
          >
            <div className="flex items-center">
              <DocumentTextIcon className="h-5 w-5 mr-1" />
              <span>Documentos</span>
            </div>
          </Link>
          <Link
            href="/dashboard"
            className={`px-3 py-2 rounded-md text-sm font-medium ${isActive("/dashboard")}`}
          >
            <div className="flex items-center">
              <ChartBarIcon className="h-5 w-5 mr-1" />
              <span>Dashboard</span>
            </div>
          </Link>
          <Link
            href="/dashboard/weaviate"
            className={`px-3 py-2 rounded-md text-sm font-medium ${isActive("/dashboard/weaviate")}`}
          >
            <div className="flex items-center">
              <CircleStackIcon className="h-5 w-5 mr-1" />
              <span>BD</span>
            </div>
          </Link>
          <Link
            href="/settings"
            className={`px-3 py-2 rounded-md text-sm font-medium ${isActive("/settings")}`}
          >
            <div className="flex items-center">
              <Cog6ToothIcon className="h-5 w-5 mr-1" />
              <span>Configuración</span>
            </div>
          </Link>
        </div>

        {/* User / auth actions (desktop) */}
        <div className="hidden md:flex items-center space-x-4">
          {session?.user ? (
            <>
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                  {(session.user.name?.[0] || session.user.email?.[0] || "U").toUpperCase()}
                </div>
                <span className="text-sm font-medium text-gray-700">
                  {session.user.name || session.user.email}
                </span>
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoading}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Signing out..." : "Sign out"}
              </button>
            </>
          ) : (
            // <Link
            //   href="/auth/signin"
            //   className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            // >
            //   Sign in
            // </Link>
            null
          )}
        </div>

        {/* Mobile toggle */}
        <div className="md:hidden">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="inline-flex items-center justify-center p-2 rounded-md text-[#01f6d2] hover:text-black hover:bg-gray-100 focus:outline-none"
          >
            <span className="sr-only">{isMenuOpen ? "Cerrar menú" : "Abrir menú"}</span>
            {isMenuOpen ? (
              <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
            ) : (
              <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t border-gray-200">
          <Link
            href="/"
            className={`block px-3 py-2 rounded-md text-base font-medium ${isActive("/")}`}
            onClick={() => setIsMenuOpen(false)}
          >
            <div className="flex items-center">
              <ChatBubbleLeftRightIcon className="h-5 w-5 mr-2" />
              <span>Chat</span>
            </div>
          </Link>
          <Link
            href="/documents"
            className={`block px-3 py-2 rounded-md text-base font-medium ${isActive("/documents")}`}
            onClick={() => setIsMenuOpen(false)}
          >
            <div className="flex items-center">
              <DocumentTextIcon className="h-5 w-5 mr-2" />
              <span>Documentos</span>
            </div>
          </Link>
          <Link
            href="/dashboard"
            className={`block px-3 py-2 rounded-md text-base font-medium ${isActive("/dashboard")}`}
            onClick={() => setIsMenuOpen(false)}
          >
            <div className="flex items-center">
              <ChartBarIcon className="h-5 w-5 mr-2" />
              <span>Dashboard</span>
            </div>
          </Link>
          <Link
            href="/dashboard/weaviate"
            className={`block px-3 py-2 rounded-md text-base font-medium ${isActive("/dashboard/weaviate")}`}
            onClick={() => setIsMenuOpen(false)}
          >
            <div className="flex items-center">
              <CircleStackIcon className="h-5 w-5 mr-2" />
              <span>BD</span>
            </div>
          </Link>
          <Link
            href="/settings"
            className={`block px-3 py-2 rounded-md text-base font-medium ${isActive("/settings")}`}
            onClick={() => setIsMenuOpen(false)}
          >
            <div className="flex items-center">
              <Cog6ToothIcon className="h-5 w-5 mr-2" />
              <span>Configuración</span>
            </div>
          </Link>

          {/* Auth action (mobile) */}
          {session?.user ? (
            <button
              onClick={() => {
                setIsMenuOpen(false);
                handleLogout();
              }}
              disabled={isLoading}
              className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Signing out..." : "Sign out"}
            </button>
          ) : (
            <Link
              href="/auth/signin"
              className="block px-3 py-2 rounded-md text-base font-medium text-indigo-600 hover:bg-indigo-100"
              onClick={() => setIsMenuOpen(false)}
            >
              Sign in
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
