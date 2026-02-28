"use client";

import { useCallback, useState } from "react";
import { ArrowLeftRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type CompareStatus = "both" | "local_only" | "vercel_only" | "schema_only";

interface CompareRow {
  key: string;
  status: CompareStatus;
  inSchema: boolean;
  inLocal: boolean;
  inVercel: boolean;
  vercelTargets: string[];
}

interface CompareData {
  success: boolean;
  vercelError: string | null;
  summary: {
    total: number;
    both: number;
    localOnly: number;
    vercelOnly: number;
    schemaOnly: number;
  };
  rows: CompareRow[];
}

const STATUS_CONFIG: Record<
  CompareStatus,
  { label: string; color: string; bg: string }
> = {
  both: {
    label: "Synkad",
    color: "text-green-400",
    bg: "border-green-500/20",
  },
  local_only: {
    label: "Bara lokalt",
    color: "text-amber-400",
    bg: "border-amber-500/30",
  },
  vercel_only: {
    label: "Bara Vercel",
    color: "text-blue-400",
    bg: "border-blue-500/30",
  },
  schema_only: {
    label: "Saknas",
    color: "text-red-400",
    bg: "border-red-500/30",
  },
};

type FilterOption = "all" | CompareStatus;

export function EnvCompare() {
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterOption>("all");

  const fetchCompare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/env/compare");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as CompareData;
      if (!json.success) throw new Error("API returned failure");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = data?.rows.filter(
    (r) => filter === "all" || r.status === filter,
  );

  return (
    <div className="border border-gray-800 bg-black/50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
            <ArrowLeftRight className="text-brand-teal h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              Env-jämförare
            </h2>
            <p className="text-sm text-gray-500">
              Lokalt vs Vercel vs kod-schema
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchCompare()}
          disabled={loading}
          className="gap-2 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {data ? "Uppdatera" : "Jämför"}
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {data?.vercelError && (
        <p className="mb-3 text-sm text-amber-400">
          Vercel: {data.vercelError}
        </p>
      )}

      {data && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                ["all", `Alla (${data.summary.total})`],
                ["both", `Synkade (${data.summary.both})`],
                ["local_only", `Bara lokalt (${data.summary.localOnly})`],
                ["vercel_only", `Bara Vercel (${data.summary.vercelOnly})`],
                ["schema_only", `Saknas (${data.summary.schemaOnly})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded px-3 py-1 text-xs transition-colors ${
                  filter === value
                    ? "bg-brand-teal/20 text-brand-teal ring-1 ring-brand-teal/40"
                    : "bg-gray-800/50 text-gray-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-1.5">
            {filtered?.map((row) => {
              const cfg = STATUS_CONFIG[row.status];
              return (
                <div
                  key={row.key}
                  className={`flex items-center justify-between border bg-black/30 px-3 py-2 text-sm ${cfg.bg}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-right font-mono text-[10px] text-gray-600">
                      {row.inLocal ? "L" : "·"}
                      {row.inVercel ? "V" : "·"}
                      {row.inSchema ? "S" : "·"}
                    </span>
                    <span className="font-mono text-xs text-gray-300">
                      {row.key}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.vercelTargets.length > 0 && (
                      <span className="text-[10px] text-gray-600">
                        {row.vercelTargets.join(", ")}
                      </span>
                    )}
                    <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-[10px] text-gray-600">
            L = Lokalt (process.env) &middot; V = Vercel &middot; S = Definierad
            i kod-schema
          </div>
        </>
      )}

      {!data && !loading && (
        <p className="text-sm text-gray-500">
          Tryck &quot;Jämför&quot; för att hämta och jämföra env-variabler.
        </p>
      )}
    </div>
  );
}
