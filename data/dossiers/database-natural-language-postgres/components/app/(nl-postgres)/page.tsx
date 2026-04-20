"use client";

import { useState } from "react";

export default function NaturalLanguagePostgresPage() {
  const [question, setQuestion] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Ask your Postgres database</h1>
        <p className="text-sm text-muted-foreground">
          Ask questions in plain English and get SQL-backed results.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Example: Show monthly revenue for the last 12 months"
          className="min-h-28 w-full rounded-md border p-3"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="rounded-md border px-4 py-2"
        >
          {loading ? "Running..." : "Run query"}
        </button>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {data ? (
        <section className="space-y-4">
          <div>
            <h2 className="font-medium">Generated SQL</h2>
            <pre className="overflow-auto rounded-md border p-3 text-sm">{data.sql}</pre>
          </div>

          <div>
            <h2 className="font-medium">Summary</h2>
            <p className="text-sm">{data.summary}</p>
          </div>

          <div>
            <h2 className="font-medium">Rows</h2>
            <pre className="overflow-auto rounded-md border p-3 text-sm">
              {JSON.stringify(data.rows, null, 2)}
            </pre>
          </div>
        </section>
      ) : null}
    </main>
  );
}
