"use client";

import Link from "next/link";
import {ArrowLeftIcon} from "@heroicons/react/24/outline";
import LeadsTable from "./components/LeadsTable";

export default function LeadsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-6">
        <div className="flex items-center">
          <Link
            href="/dashboard"
            className="text-[#01f6d2] hover:text-teal-600 mr-2"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-[#01f6d2]">
            Gestión de Leads
          </h1>
        </div>
        <nav className="flex my-4">
          <Link href="/" className="text-[#01f6d2] hover:underline">
            Inicio
          </Link>
          <span className="mx-2 text-gray-400">/</span>
          <Link href="/dashboard" className="text-[#01f6d2] hover:underline">
            Dashboard
          </Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-black">Leads</span>
        </nav>
      </header>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-6 text-[#01f6d2]">
          Listado de Leads
        </h2>
        <LeadsTable />
      </div>
    </div>
  );
}
