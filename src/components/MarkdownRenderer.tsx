"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Markdown renderer component for chat messages.
 * Supports GitHub Flavored Markdown (GFM) including:
 * - Bold, italic, strikethrough
 * - Lists (ordered and unordered)
 * - Links
 * - Code blocks and inline code
 * - Tables
 * - Blockquotes
 */
export default function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className={`markdown-content ${className}`}
      components={{
        // Headings
        h1: ({ children }) => (
          <h1 className="text-xl font-bold mb-2 mt-3">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-bold mb-2 mt-3">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-bold mb-1 mt-2">{children}</h3>
        ),

        // Paragraphs
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,

        // Lists
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2 ml-2 space-y-1">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2 ml-2 space-y-1">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="text-gray-800">{children}</li>,

        // Bold and italic
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,

        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-600 hover:text-teal-800 underline"
          >
            {children}
          </a>
        ),

        // Code
        code: ({ className, children }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800">
                {children}
              </code>
            );
          }
          return (
            <code className="block bg-gray-100 p-3 rounded-lg text-sm font-mono overflow-x-auto my-2">
              {children}
            </code>
          );
        },

        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-teal-400 pl-3 italic text-gray-700 my-2">
            {children}
          </blockquote>
        ),

        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full border border-gray-200 rounded">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-100">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-sm font-semibold border-b">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-sm border-b">{children}</td>
        ),

        // Horizontal rule
        hr: () => <hr className="my-3 border-gray-300" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
