"use client";

import {useState} from "react";

interface Match {
  id: string;
  score: number;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
}

export default function TestQuery() {
  const [query, setQuery] = useState("");
  const [namespace, setNamespace] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          namespace: namespace.trim() || undefined,
          topK: 3,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error querying the database");
      }

      setResults(data.matches || []);
    } catch (err) {
      console.error("Error querying:", err);
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Test Vector Search</h2>

      <form onSubmit={handleSubmit} className="mb-6 space-y-4">
        <div>
          <label
            htmlFor="namespace"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Namespace (optional)
          </label>
          <input
            type="text"
            id="namespace"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            placeholder="e.g., test_docs"
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label
            htmlFor="query"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Query
          </label>
          <input
            type="text"
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., ¿Qué es la cuenta Smart?"
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className={`px-4 py-2 rounded-md ${
            isLoading || !query.trim()
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-700 text-white"
          }`}
        >
          {isLoading ? "Searching..." : "Search"}
        </button>
      </form>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {results.length > 0 ? (
        <div>
          <h3 className="text-lg font-semibold mb-2">
            Results ({results.length})
          </h3>
          <div className="space-y-4">
            {results.map((match, index) => (
              <div
                key={match.id}
                className="p-3 border border-gray-200 rounded-md"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-bold">Match #{index + 1}</span>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    Score: {match.score.toFixed(4)}
                  </span>
                </div>
                <div className="text-sm whitespace-pre-wrap mb-2">
                  {match.text}
                </div>
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <details>
                    <summary className="text-xs text-gray-500 cursor-pointer">
                      Metadata
                    </summary>
                    <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto max-h-40">
                      {JSON.stringify(match.metadata, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !isLoading && !error ? (
        <p className="text-gray-500">
          No results to display. Try a search query above.
        </p>
      ) : null}
    </div>
  );
}
