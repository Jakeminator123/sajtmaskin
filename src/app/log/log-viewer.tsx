"use client";

import { useEffect, useMemo, useState } from "react";

type DevLogEntry = {
  ts: string;
  target: string;
  slug: string | null;
  data: Record<string, unknown>;
};

type DevLogResponse = {
  success: boolean;
  enabled: boolean;
  latestSlug: string | null;
  slugs: string[];
  entryCount: number;
  entries: DevLogEntry[];
  error?: string;
};

type PromptLog = {
  id: string;
  event: string;
  appProjectId: string | null;
  chatId: string | null;
  promptOriginal: string | null;
  promptFormatted: string | null;
  systemPrompt: string | null;
  buildIntent: string | null;
  buildMethod: string | null;
  modelTier: string | null;
  createdAt: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatWhen(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("sv-SE");
}

function summarizeTokens(entries: DevLogEntry[]) {
  return entries.reduce(
    (acc, entry) => {
      const promptTokens =
        readNumber(entry.data.promptTokens) ??
        readNumber((entry.data.tokenUsage as Record<string, unknown> | undefined)?.prompt);
      const completionTokens =
        readNumber(entry.data.completionTokens) ??
        readNumber((entry.data.tokenUsage as Record<string, unknown> | undefined)?.completion);

      if (promptTokens) acc.prompt += promptTokens;
      if (completionTokens) acc.completion += completionTokens;
      return acc;
    },
    { prompt: 0, completion: 0 },
  );
}

export function LogViewer() {
  const [devLog, setDevLog] = useState<DevLogResponse | null>(null);
  const [promptLogs, setPromptLogs] = useState<PromptLog[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  const fetchLogs = async (slug: string | null, withLoading = false) => {
    if (withLoading) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (slug) params.set("slug", slug);
      const response = await fetch(`/api/dev-log?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as DevLogResponse;
      setDevLog(data);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Kunde inte hämta dev-loggen.",
      );
    } finally {
      if (withLoading) setLoading(false);
    }
  };

  const fetchPromptLogs = async () => {
    setPromptError(null);
    try {
      const response = await fetch("/api/admin/prompt-logs?limit=20", {
        cache: "no-store",
      });
      if (!response.ok) {
        setPromptError(
          response.status === 401
            ? "Admin prompt logs kraver admin-inloggning."
            : "Kunde inte hämta prompt logs.",
        );
        return;
      }
      const data = (await response.json()) as {
        success: boolean;
        logs?: PromptLog[];
        error?: string;
      };
      if (!data.success || !Array.isArray(data.logs)) {
        setPromptError(data.error || "Prompt logs var inte tillgängliga.");
        return;
      }
      setPromptLogs(data.logs);
    } catch (fetchError) {
      setPromptError(
        fetchError instanceof Error
          ? fetchError.message
          : "Kunde inte hämta prompt logs.",
      );
    }
  };

  useEffect(() => {
    void fetchLogs(selectedSlug, true);
    void fetchPromptLogs();
  }, [selectedSlug]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void fetchLogs(selectedSlug);
      void fetchPromptLogs();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [autoRefresh, selectedSlug]);

  const tokenSummary = useMemo(
    () => summarizeTokens(devLog?.entries ?? []),
    [devLog?.entries],
  );

  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    for (const entry of devLog?.entries ?? []) {
      const type = readString(entry.data.type);
      if (type) types.add(type);
    }
    return types.size;
  }, [devLog?.entries]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">/log</h1>
              <p className="mt-1 text-sm text-neutral-400">
                Lokal prompt- och runtime-timeline for dev-loggen. Visar senaste
                flodet, sluggar och promptlogs nar admin-API:t ar tillgangligt.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoRefresh((current) => !current)}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  autoRefresh
                    ? "bg-emerald-500 text-black"
                    : "bg-neutral-800 text-neutral-200"
                }`}
              >
                {autoRefresh ? "Auto-refresh pa" : "Auto-refresh av"}
              </button>
              <button
                type="button"
                onClick={() => {
                  void fetchLogs(selectedSlug, true);
                  void fetchPromptLogs();
                }}
                className="rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-950"
              >
                Uppdatera nu
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-neutral-800 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Entries
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {devLog?.entryCount ?? 0}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Slug
              </div>
              <div className="mt-2 truncate text-sm font-medium">
                {selectedSlug || devLog?.latestSlug || "-"}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Prompt tokens
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {tokenSummary.prompt}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Completion tokens
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {tokenSummary.completion}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedSlug(null)}
              className={`rounded-full border px-3 py-1 text-xs ${
                selectedSlug === null
                  ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                  : "border-neutral-700 text-neutral-300"
              }`}
            >
              Alla sluggar
            </button>
            {(devLog?.slugs ?? []).map((slug) => (
              <button
                key={slug}
                type="button"
                onClick={() => setSelectedSlug(slug)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  selectedSlug === slug
                    ? "border-sky-400 bg-sky-400/10 text-sky-200"
                    : "border-neutral-700 text-neutral-300"
                }`}
              >
                {slug}
              </button>
            ))}
          </div>
        </header>

        {loading ? (
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6 text-sm text-neutral-400">
            Laser loggdata...
          </section>
        ) : null}

        {error ? (
          <section className="rounded-2xl border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">
            {error}
          </section>
        ) : null}

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Runtime timeline</h2>
              <p className="text-sm text-neutral-400">
                {uniqueTypes} unika eventtyper i det senaste flodet.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {(devLog?.entries ?? []).map((entry, index) => {
              const type = readString(entry.data.type) || "unknown";
              const message = readString(entry.data.message);
              const model =
                readString(entry.data.modelId) ||
                readString(entry.data.model) ||
                readString(entry.data.modelTier);
              const chatId = readString(entry.data.chatId);
              const versionId = readString(entry.data.versionId);
              return (
                <article
                  key={`${entry.ts}-${type}-${index}`}
                  className="rounded-xl border border-neutral-800 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-200">
                      {entry.target}
                    </span>
                    <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-200">
                      {type}
                    </span>
                    {entry.slug ? (
                      <span className="rounded-full bg-sky-950 px-2 py-1 text-sky-200">
                        {entry.slug}
                      </span>
                    ) : null}
                    <span className="text-neutral-500">{formatWhen(entry.ts)}</span>
                  </div>

                  {message ? (
                    <p className="mt-3 text-sm text-neutral-200">{message}</p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-400">
                    {model ? <span>Model: {model}</span> : null}
                    {chatId ? <span>Chat: {chatId}</span> : null}
                    {versionId ? <span>Version: {versionId}</span> : null}
                    {typeof entry.data.promptOptimizedLength === "number" ? (
                      <span>
                        Prompt len: {String(entry.data.promptOptimizedLength)}
                      </span>
                    ) : null}
                    {typeof entry.data.durationMs === "number" ? (
                      <span>Duration: {String(entry.data.durationMs)} ms</span>
                    ) : null}
                  </div>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-neutral-300">
                      Visa JSON
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-300">
                      {JSON.stringify(entry.data, null, 2)}
                    </pre>
                  </details>
                </article>
              );
            })}

            {!devLog?.entries?.length && !loading ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-400">
                Inga loggentries hittades. Kor dev-servern och trigga ett
                runtime-flode, eller kontrollera att `SAJTMASKIN_DEV_LOG` inte
                ar satt till `false`.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Prompt logs</h2>
            <p className="text-sm text-neutral-400">
              Hamtas besta effort via befintligt admin-API.
            </p>
          </div>

          {promptError ? (
            <div className="rounded-xl border border-amber-900 bg-amber-950/40 p-4 text-sm text-amber-200">
              {promptError}
            </div>
          ) : null}

          <div className="space-y-3">
            {promptLogs.map((log) => (
              <article
                key={log.id}
                className="rounded-xl border border-neutral-800 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-200">
                    {log.event}
                  </span>
                  {log.modelTier ? (
                    <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-200">
                      {log.modelTier}
                    </span>
                  ) : null}
                  {log.buildMethod ? (
                    <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-200">
                      {log.buildMethod}
                    </span>
                  ) : null}
                  <span className="text-neutral-500">
                    {formatWhen(log.createdAt)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-400">
                  {log.chatId ? <span>Chat: {log.chatId}</span> : null}
                  {log.appProjectId ? <span>Project: {log.appProjectId}</span> : null}
                  {log.buildIntent ? <span>Intent: {log.buildIntent}</span> : null}
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-neutral-300">
                    Visa promptdetaljer
                  </summary>
                  <div className="mt-3 grid gap-3">
                    <div>
                      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
                        Original
                      </div>
                      <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-300">
                        {log.promptOriginal || "-"}
                      </pre>
                    </div>
                    <div>
                      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
                        Formatted
                      </div>
                      <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-300">
                        {log.promptFormatted || "-"}
                      </pre>
                    </div>
                    <div>
                      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
                        System prompt
                      </div>
                      <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-300">
                        {log.systemPrompt || "-"}
                      </pre>
                    </div>
                  </div>
                </details>
              </article>
            ))}

            {!promptLogs.length && !promptError ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-400">
                Inga prompt logs tillgangliga just nu.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
