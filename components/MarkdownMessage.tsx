/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  content: string;
};

/**
 * Renders markdown content with styled components for chat bubbles.
 * Supports: headers, bold, italic, lists, tables, links, code blocks, blockquotes.
 */
export default function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headers
        h1: ({ children }: any) => (
          <h1 className="text-lg font-bold mt-3 mb-1.5 first:mt-0">{children}</h1>
        ),
        h2: ({ children }: any) => (
          <h2 className="text-base font-bold mt-2.5 mb-1 first:mt-0">{children}</h2>
        ),
        h3: ({ children }: any) => (
          <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h3>
        ),
        // Paragraphs
        p: ({ children }: any) => (
          <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        ),
        // Bold & italic
        strong: ({ children }: any) => (
          <strong className="font-semibold text-white">{children}</strong>
        ),
        em: ({ children }: any) => <em className="italic">{children}</em>,
        // Lists
        ul: ({ children }: any) => (
          <ul className="list-disc list-inside mb-2 space-y-0.5 ml-1">{children}</ul>
        ),
        ol: ({ children }: any) => (
          <ol className="list-decimal list-inside mb-2 space-y-0.5 ml-1">{children}</ol>
        ),
        li: ({ children }: any) => (
          <li className="text-sm leading-relaxed">{children}</li>
        ),
        // Links
        a: ({ href, children }: any) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
          >
            {children}
          </a>
        ),
        // Inline code
        code: ({ className, children, ...props }: any) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <code
                className="block bg-black/30 rounded-lg p-3 my-2 text-xs font-mono overflow-x-auto border border-white/10"
                {...props}
              >
                {children}
              </code>
            );
          }
          return (
            <code
              className="bg-white/10 rounded px-1.5 py-0.5 text-xs font-mono"
              {...props}
            >
              {children}
            </code>
          );
        },
        // Code blocks
        pre: ({ children }: any) => (
          <pre className="my-2 overflow-x-auto">{children}</pre>
        ),
        // Blockquotes
        blockquote: ({ children }: any) => (
          <blockquote className="border-l-2 border-white/30 pl-3 my-2 text-white/70 italic">
            {children}
          </blockquote>
        ),
        // Tables
        table: ({ children }: any) => (
          <div className="overflow-x-auto my-2 rounded-lg border border-white/10">
            <table className="w-full text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }: any) => (
          <thead className="bg-white/10 text-white/90">{children}</thead>
        ),
        tbody: ({ children }: any) => <tbody>{children}</tbody>,
        tr: ({ children }: any) => (
          <tr className="border-b border-white/5 last:border-0">{children}</tr>
        ),
        th: ({ children }: any) => (
          <th className="px-3 py-1.5 text-left font-semibold whitespace-nowrap">
            {children}
          </th>
        ),
        td: ({ children }: any) => (
          <td className="px-3 py-1.5 text-white/80">{children}</td>
        ),
        // Horizontal rule
        hr: () => <hr className="border-white/10 my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
