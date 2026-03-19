"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

type TelemetryRecord = {
  id: string;
  chatId: string;
  versionId: string | null;
  scaffoldId: string | null;
  scaffoldAlternatives: string[] | null;
  model: string;
  modelTier: string | null;
  buildIntent: string | null;
  buildMethod: string | null;
  promptClassification: string | null;
  retryCount: number;
  autofixApplied: boolean;
  syntaxFixerUsed: boolean;
  preflightErrorCount: number;
  preflightWarningCount: number;
  seoIssueCount: number;
  previewSuccess: boolean | null;
  previewBlockingReason: string | null;
  qualityGateResult: string | null;
  durationMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  fileCount: number | null;
  scaffoldRetryUsed: boolean;
  scaffoldRetrySuggested: string | null;
  deployResult: string | null;
  userFeedback: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(prompt: number | null, completion: number | null): string {
  if (prompt === null && completion === null) return "-";
  const p = prompt ?? 0;
  const c = completion ?? 0;
  return `${p.toLocaleString()} / ${c.toLocaleString()} (${(p + c).toLocaleString()})`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("sv-SE", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function PhaseRouting({ meta }: { meta: Record<string, unknown> | null }) {
  const routing = meta?.phaseRouting as Record<string, unknown> | undefined;
  if (!routing) return <span className="text-gray-500">-</span>;
  return (
    <div className="space-y-0.5 text-[10px]">
      {Object.entries(routing).map(([phase, info]) => {
        const modelId = typeof info === "object" && info !== null
          ? String((info as Record<string, unknown>).modelId ?? "")
          : String(info ?? "");
        return (
          <div key={phase}>
            <span className="text-gray-400">{phase}:</span>{" "}
            <span className="text-gray-200">{modelId || "-"}</span>
          </div>
        );
      })}
    </div>
  );
}

export function AdminTelemetryTab({
  records,
  isLoading,
  error,
}: {
  records: TelemetryRecord[];
  isLoading: boolean;
  error: string | null;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Laddar telemetri...
      </div>
    );
  }

  if (error) {
    return <div className="py-4 text-red-400">{error}</div>;
  }

  if (records.length === 0) {
    return <div className="py-4 text-gray-500">Ingen telemetri hittades.</div>;
  }

  return (
    <div className="space-y-1">
      <div className="mb-2 text-xs text-gray-400">
        Visar {records.length} senaste generationer fran generation_telemetry.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700 text-left text-gray-400">
              <th className="px-2 py-1.5">Tid</th>
              <th className="px-2 py-1.5">Modell</th>
              <th className="px-2 py-1.5">Tier</th>
              <th className="px-2 py-1.5">Scaffold</th>
              <th className="px-2 py-1.5">Tokens (in/ut/total)</th>
              <th className="px-2 py-1.5">Tid</th>
              <th className="px-2 py-1.5">Filer</th>
              <th className="px-2 py-1.5">Preview</th>
              <th className="px-2 py-1.5">Autofix</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {records.map((row) => {
              const isExpanded = expandedId === row.id;
              return (
                <tr key={row.id} className="border-b border-gray-800 hover:bg-gray-900/50">
                  <td className="px-2 py-1.5 whitespace-nowrap">{formatTime(row.createdAt)}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px]">{row.model}</td>
                  <td className="px-2 py-1.5">{row.modelTier || "-"}</td>
                  <td className="px-2 py-1.5">{row.scaffoldId || "-"}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px]">
                    {formatTokens(row.promptTokens, row.completionTokens)}
                  </td>
                  <td className="px-2 py-1.5">{formatDuration(row.durationMs)}</td>
                  <td className="px-2 py-1.5">{row.fileCount ?? "-"}</td>
                  <td className="px-2 py-1.5">
                    {row.previewSuccess === true ? (
                      <span className="text-green-400">OK</span>
                    ) : row.previewSuccess === false ? (
                      <span className="text-red-400">Fail</span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {row.autofixApplied ? (
                      <span className="text-amber-300">Ja</span>
                    ) : (
                      <span className="text-gray-500">Nej</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      className="text-gray-400 hover:text-white"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expandedId && (() => {
        const row = records.find((r) => r.id === expandedId);
        if (!row) return null;
        return (
          <div className="mt-2 rounded-md border border-gray-700 bg-gray-900 p-3 text-xs">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-3">
              <div><span className="text-gray-400">Chat:</span> {row.chatId}</div>
              <div><span className="text-gray-400">Version:</span> {row.versionId || "-"}</div>
              <div><span className="text-gray-400">Build intent:</span> {row.buildIntent || "-"}</div>
              <div><span className="text-gray-400">Build method:</span> {row.buildMethod || "-"}</div>
              <div><span className="text-gray-400">Prompt class:</span> {row.promptClassification || "-"}</div>
              <div><span className="text-gray-400">Retry count:</span> {row.retryCount}</div>
              <div><span className="text-gray-400">Syntax fixer:</span> {row.syntaxFixerUsed ? "Ja" : "Nej"}</div>
              <div><span className="text-gray-400">Preflight errors:</span> {row.preflightErrorCount}</div>
              <div><span className="text-gray-400">Preflight warnings:</span> {row.preflightWarningCount}</div>
              <div><span className="text-gray-400">SEO issues:</span> {row.seoIssueCount}</div>
              <div><span className="text-gray-400">Quality gate:</span> {row.qualityGateResult || "-"}</div>
              <div><span className="text-gray-400">Deploy:</span> {row.deployResult || "-"}</div>
              <div><span className="text-gray-400">Feedback:</span> {row.userFeedback || "-"}</div>
              <div><span className="text-gray-400">Scaffold retry:</span> {row.scaffoldRetryUsed ? "Ja" : "Nej"}</div>
              <div><span className="text-gray-400">Scaffold suggested:</span> {row.scaffoldRetrySuggested || "-"}</div>
              {row.previewBlockingReason && (
                <div className="col-span-full"><span className="text-gray-400">Preview blocker:</span> {row.previewBlockingReason}</div>
              )}
            </div>
            <div className="mt-3">
              <div className="mb-1 text-gray-400">Phase routing:</div>
              <PhaseRouting meta={row.meta} />
            </div>
            {row.meta && (
              <details className="mt-3">
                <summary className="cursor-pointer text-gray-400 hover:text-gray-200">Visa full meta-JSON</summary>
                <pre className="mt-1 max-h-60 overflow-auto rounded bg-gray-950 p-2 text-[10px] text-gray-300">
                  {JSON.stringify(row.meta, null, 2)}
                </pre>
              </details>
            )}
          </div>
        );
      })()}
    </div>
  );
}