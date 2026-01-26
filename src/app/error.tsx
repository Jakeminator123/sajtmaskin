"use client";

import { useEffect } from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[app/error] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
        <div className="mb-4 text-red-500">
          <svg
            className="mx-auto h-16 w-16"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-bold text-white">Något gick fel</h2>
        <p className="mb-6 text-gray-400">
          Ett oväntat fel inträffade. Försök att ladda om sidan.
        </p>
        <div className="space-y-3">
          <button
            onClick={() => reset()}
            className="bg-brand-blue hover:bg-brand-blue/90 w-full rounded-lg px-4 py-2 font-medium text-white transition-colors"
          >
            Försök igen
          </button>
          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-lg bg-gray-800 px-4 py-2 font-medium text-white transition-colors hover:bg-gray-700"
          >
            Ladda om sidan
          </button>
        </div>
        {process.env.NODE_ENV === "development" && (
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-400">
              Teknisk information
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-gray-950 p-3 text-xs text-red-400">
              {error.message}
              {"\n\n"}
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
