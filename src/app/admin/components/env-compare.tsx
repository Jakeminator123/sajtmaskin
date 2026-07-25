"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminResource } from "../lib/use-admin-resource";
import { DataState, SectionCard, StatusBadge, TechnicalDetails, type StatusTone } from "./ui-bits";

type CompareStatus = "both" | "local_only" | "vercel_only" | "schema_only";
type EnvValueState = "set" | "empty" | "placeholder" | "missing";
type EnvClassification =
  | "shared_runtime"
  | "optional_runtime"
  | "environment_specific"
  | "local_only"
  | "vercel_managed";
type SyncRecommendation =
  | "none"
  | "push_local_to_vercel"
  | "pull_from_vercel"
  | "review_manually";

interface CompareRow {
  key: string;
  status: CompareStatus;
  inSchema: boolean;
  inLocal: boolean;
  inVercel: boolean;
  localState: EnvValueState;
  classification: EnvClassification;
  syncRecommendation: SyncRecommendation;
  notes?: string;
  vercelTargets: string[];
  recommendedVercelTargets: string[];
  hasTargetCoverage: boolean;
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
    pushToVercel: number;
    pullFromVercel: number;
    reviewManually: number;
  };
  rows: CompareRow[];
}

const STATUS_LABEL: Record<CompareStatus, { label: string; tone: StatusTone }> = {
  both: { label: "Synkad", tone: "ok" },
  local_only: { label: "Bara lokalt", tone: "warn" },
  vercel_only: { label: "Bara Vercel", tone: "warn" },
  schema_only: { label: "Saknas överallt", tone: "error" },
};

const CLASSIFICATION_LABELS: Record<EnvClassification, string> = {
  shared_runtime: "Delad",
  optional_runtime: "Valfri",
  environment_specific: "Miljöspecifik",
  local_only: "Endast lokal",
  vercel_managed: "Vercel-styrd",
};

const SYNC_LABELS: Record<SyncRecommendation, string> = {
  none: "Inget att göra",
  push_local_to_vercel: "Lägg upp på Vercel",
  pull_from_vercel: "Hämta från Vercel",
  review_manually: "Granska manuellt",
};

const LOCAL_STATE_LABELS: Record<EnvValueState, string> = {
  set: "satt",
  empty: "tom",
  placeholder: "platshållare",
  missing: "saknas",
};

const FILTERS: { value: "all" | CompareStatus; label: string }[] = [
  { value: "all", label: "Alla" },
  { value: "both", label: "Synkade" },
  { value: "local_only", label: "Bara lokalt" },
  { value: "vercel_only", label: "Bara Vercel" },
  { value: "schema_only", label: "Saknas" },
];

/**
 * Compares env keys across three places: the local process, the Vercel project
 * and the code schema. The heavy lifting lives in `/api/admin/env/compare`, which
 * reads the canonical env policy (`src/lib/env-audit.ts`) — this component only
 * renders it. Fetched on demand (the Vercel call is slow), not on mount.
 */
export function EnvCompare() {
  const [started, setStarted] = useState(false);
  const [filter, setFilter] = useState<"all" | CompareStatus>("all");

  const { data, loading, error, reload } = useAdminResource<CompareData>("/api/admin/env/compare", {
    enabled: started,
    errorMessage: "Kunde inte jämföra env-variabler",
  });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return filter === "all" ? all : all.filter((row) => row.status === filter);
  }, [data, filter]);

  const counts: Record<"all" | CompareStatus, number> = {
    all: data?.summary.total ?? 0,
    both: data?.summary.both ?? 0,
    local_only: data?.summary.localOnly ?? 0,
    vercel_only: data?.summary.vercelOnly ?? 0,
    schema_only: data?.summary.schemaOnly ?? 0,
  };

  return (
    <SectionCard
      title="Jämför nycklar: lokalt, Vercel och kod"
      description="Visar var varje nyckel finns och vad som behöver göras. Inga värden hämtas."
      icon={ArrowLeftRight}
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (!started) setStarted(true);
            else void reload();
          }}
          disabled={loading}
        >
          {data ? "Jämför igen" : "Jämför"}
        </Button>
      }
    >
      {!started ? (
        <p className="text-muted-foreground text-sm">
          Klicka på “Jämför” för att hämta läget. Jämförelsen anropar Vercel och tar några
          sekunder.
        </p>
      ) : (
        <DataState
          loading={loading && !data}
          error={error}
          isEmpty={!data}
          onRetry={() => void reload()}
          emptyTitle="Ingen jämförelse ännu"
        >
          {data && (
            <>
              {data.vercelError && (
                <p className="mb-3 text-xs text-amber-400">Vercel: {data.vercelError}</p>
              )}

              <div className="mb-3 flex flex-wrap gap-2">
                {FILTERS.map((option) => (
                  <Button
                    key={option.value}
                    variant={filter === option.value ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label} ({counts[option.value]})
                  </Button>
                ))}
              </div>

              <DataState
                isEmpty={rows.length === 0}
                emptyTitle="Inga nycklar i det urvalet"
                emptyDescription="Byt filter för att se andra nycklar."
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nyckel</TableHead>
                      <TableHead>Lokalt</TableHead>
                      <TableHead>Vercel</TableHead>
                      <TableHead>Att göra</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const status = STATUS_LABEL[row.status];
                      return (
                        <TableRow key={row.key}>
                          <TableCell className="font-mono text-xs">
                            {row.key}
                            <p className="text-muted-foreground mt-0.5 text-[11px] font-sans">
                              {CLASSIFICATION_LABELS[row.classification]}
                              {row.notes ? ` · ${row.notes}` : ""}
                            </p>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {LOCAL_STATE_LABELS[row.localState]}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {row.vercelTargets.length > 0 ? row.vercelTargets.join(", ") : "—"}
                            {!row.hasTargetCoverage && row.recommendedVercelTargets.length > 0 && (
                              <span className="mt-0.5 block text-amber-400">
                                bör även finnas i: {row.recommendedVercelTargets.join(", ")}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {SYNC_LABELS[row.syncRecommendation]}
                          </TableCell>
                          <TableCell className="text-right">
                            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </DataState>

              <TechnicalDetails summary="Visa sammanfattning">
                <ul className="text-muted-foreground space-y-1 text-xs">
                  <li>Att lägga upp på Vercel: {data.summary.pushToVercel}</li>
                  <li>Att hämta från Vercel: {data.summary.pullFromVercel}</li>
                  <li>Kräver manuell granskning: {data.summary.reviewManually}</li>
                  <li>
                    “Lokalt” läses ur processens env, “Vercel” ur projektets env-variabler och
                    “kod” ur env-schemat.
                  </li>
                </ul>
              </TechnicalDetails>
            </>
          )}
        </DataState>
      )}
    </SectionCard>
  );
}
