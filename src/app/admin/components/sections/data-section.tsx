"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Recycle,
  Database,
  FolderOpen,
  HardDrive,
  Loader2,
  Server,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminResource } from "../../lib/use-admin-resource";
import { postDatabaseAction } from "../../lib/admin-actions";
import { DangerAction } from "../danger-action";
import {
  DataState,
  KeyValueGrid,
  RefreshButton,
  SectionCard,
  TechnicalDetails,
  formatCount,
  toCount,
} from "../ui-bits";
import type { CleanupStatsPayload, DatabaseStats } from "../types";

/**
 * Tables the operator may empty, with plain-Swedish labels. The `table` value is
 * the API contract (`POST /api/admin/database` action `clear`) — keep in sync
 * with `tableMap` in `src/app/api/admin/database/route.ts`.
 */
const CLEARABLE_TABLES: {
  table: string;
  label: string;
  description: string;
  countKey?: keyof DatabaseStats["database"];
}[] = [
  {
    table: "page_views",
    label: "Sidvisningar",
    description: "Besöksstatistiken nollställs.",
    countKey: "pageViews",
  },
  {
    table: "guest_usage",
    label: "Gästanvändning",
    description: "Gästernas kvot för gratis byggen nollställs.",
    countKey: "guestUsage",
  },
  {
    table: "transactions",
    label: "Transaktioner",
    description: "Historiken för köp och diamanter försvinner.",
    countKey: "transactions",
  },
  {
    table: "projects",
    label: "Projekt",
    description: "Alla sajtprojekt med filer, bilder och domänorder raderas.",
    countKey: "projects",
  },
  {
    table: "company_profiles",
    label: "Företagsprofiler",
    description: "Sparade företagsuppgifter raderas.",
    countKey: "companyProfiles",
  },
  {
    table: "users",
    label: "Användare",
    description: "Alla konton raderas — utom ditt eget och testkontot.",
    countKey: "users",
  },
];

export function DataSection() {
  const {
    data: stats,
    loading,
    error,
    reload,
  } = useAdminResource<DatabaseStats, { stats: DatabaseStats }>("/api/admin/database", {
    select: (json) => json.stats,
    errorMessage: "Kunde inte hämta databasstatus",
  });

  const [cleanupStats, setCleanupStats] = useState<CleanupStatsPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (
    key: string,
    action: string,
    extra: Record<string, unknown> = {},
    successToast = true,
  ) => {
    setBusy(key);
    try {
      const result = await postDatabaseAction(action, extra);
      if (result.ok) {
        if (successToast) toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      await reload();
      return result;
    } finally {
      setBusy(null);
    }
  };

  const loadCleanupStats = async () => {
    setBusy("cleanup-stats");
    try {
      const result = await postDatabaseAction<CleanupStatsPayload>("get-cleanup-stats");
      if (result.ok && result.payload) {
        setCleanupStats(result.payload);
      } else {
        toast.error(result.message);
      }
    } finally {
      setBusy(null);
    }
  };

  const redisConnected = Boolean(stats?.redis?.connected);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RefreshButton onClick={() => void reload()} loading={loading} />
      </div>

      <DataState
        loading={loading && !stats}
        error={error}
        isEmpty={!stats}
        onRetry={() => void reload()}
        emptyTitle="Ingen databasstatus"
        emptyDescription="Databasen svarade inte med någon status."
        emptyIcon={Database}
        skeletonRows={5}
      >
        {stats && (
          <>
            <SectionCard
              title="Databas"
              description={`Innehåll per tabell. Total storlek: ${stats.dbFileSize}.`}
              icon={Database}
              tone="ok"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Innehåll</TableHead>
                    <TableHead className="text-right">Rader</TableHead>
                    <TableHead className="w-px" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {CLEARABLE_TABLES.map((entry) => {
                    // Postgres `count(*)` arrives as a string — normalise before
                    // comparing/formatting so "0" disables the button correctly.
                    const count = toCount(entry.countKey ? stats.database[entry.countKey] : 0);
                    return (
                      <TableRow key={entry.table}>
                        <TableCell>
                          <p className="font-medium">{entry.label}</p>
                          <p className="text-muted-foreground text-xs">{entry.description}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCount(count)}
                        </TableCell>
                        <TableCell>
                          <DangerAction
                            label="Rensa"
                            title={`Rensa ${entry.label.toLowerCase()}?`}
                            description={entry.description}
                            impact={`${formatCount(count)} rader raderas permanent och kan inte återskapas.`}
                            confirmWord={entry.table}
                            disabled={busy !== null || count === 0}
                            onConfirm={async () => {
                              await run(`clear:${entry.table}`, "clear", { table: entry.table });
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <TechnicalDetails summary="Visa tekniska detaljer">
                <KeyValueGrid
                  columns={3}
                  items={[
                    { label: "Databasstorlek", value: stats.dbFileSize, mono: true },
                    {
                      label: "Datakatalog",
                      value: stats.dataDir || "ej satt",
                      mono: true,
                    },
                    {
                      label: "Bekräftelseord",
                      value: "tabellens tekniska namn",
                    },
                  ]}
                />
              </TechnicalDetails>
            </SectionCard>

            <SectionCard
              title="Cache (Redis)"
              description={
                redisConnected
                  ? `Ansluten · ${stats.redis?.memoryUsed ?? "?"} använt · ${formatCount(stats.redis?.totalKeys)} nycklar`
                  : "Inte ansluten — appen fungerar men utan cache."
              }
              icon={Server}
              tone={redisConnected ? "ok" : "off"}
              action={
                redisConnected ? (
                  <DangerAction
                    label="Töm cache"
                    title="Töm cachen?"
                    description="Cachen byggs upp igen automatiskt. Första anropen efter tömningen blir långsammare."
                    impact={`${formatCount(stats.redis?.totalKeys)} nycklar i den här miljön töms.`}
                    confirmWord="cache"
                    disabled={busy !== null}
                    onConfirm={async () => {
                      await run("flush-redis", "flush-redis");
                    }}
                  />
                ) : undefined
              }
            >
              {!redisConnected && (
                <Alert>
                  <Server className="h-4 w-4" />
                  <AlertTitle>Cache är avstängd</AlertTitle>
                  <AlertDescription>
                    {/* One <p>: AlertDescription is a grid, so separate inline
                        children would each land on their own row. */}
                    <p>
                      Sätt <code className="font-mono text-xs">REDIS_URL</code> — eller{" "}
                      <code className="font-mono text-xs">REDIS_HOST</code> +{" "}
                      <code className="font-mono text-xs">REDIS_PASSWORD</code> — för att slå på
                      cachen.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
            </SectionCard>

            <SectionCard
              title="Uppladdade filer"
              description={`${formatCount(stats.uploads?.fileCount ?? 0)} filer · ${stats.uploads?.totalSize ?? "0 B"}`}
              icon={HardDrive}
              tone={toCount(stats.uploads?.fileCount) > 0 ? "ok" : "off"}
              action={
                toCount(stats.uploads?.fileCount) > 0 ? (
                  <DangerAction
                    label="Rensa filer"
                    title="Rensa uppladdade filer?"
                    description="Filer som användare laddat upp tas bort från serverns disk."
                    impact={`${formatCount(stats.uploads?.fileCount)} filer (${stats.uploads?.totalSize ?? "0 B"}) raderas.`}
                    confirmWord="filer"
                    disabled={busy !== null}
                    onConfirm={async () => {
                      await run("clear-uploads", "clear-uploads");
                    }}
                  />
                ) : undefined
              }
            >
              <DataState
                isEmpty={!stats.uploads?.files?.length}
                emptyTitle="Inga uppladdade filer"
                emptyDescription="Diskutrymmet är tomt i den här miljön."
                emptyIcon={FolderOpen}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fil</TableHead>
                      <TableHead className="text-right">Storlek</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stats.uploads?.files ?? []).map((file) => (
                      <TableRow key={file.name}>
                        <TableCell className="max-w-[320px] truncate font-mono text-xs">
                          {file.name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{file.size}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {toCount(stats.uploads?.fileCount) > (stats.uploads?.files?.length ?? 0) && (
                  <p className="text-muted-foreground mt-2 text-xs">
                    Visar de {stats.uploads?.files?.length} senaste av{" "}
                    {formatCount(stats.uploads?.fileCount)} filer.
                  </p>
                )}
              </DataState>
              <p className="text-muted-foreground mt-3 text-xs">
                Disken är tillfällig i molnmiljön: filer kan försvinna vid en ny driftsättning.
                Långlivade filer hör i Blob-lagringen, inte här.
              </p>
            </SectionCard>

            <SectionCard
              title="Automatisk städning"
              description="Ofarligt underhåll: tar bort övergivna gästprojekt och utgången cache."
              icon={Recycle}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => void loadCleanupStats()}
                  disabled={busy !== null}
                >
                  {busy === "cleanup-stats" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Visa vad som kan städas
                </Button>
              }
            >
              {cleanupStats?.stats ? (
                <>
                  <KeyValueGrid
                    columns={3}
                    items={[
                      {
                        label: "Gästprojekt totalt",
                        value: formatCount(cleanupStats.stats.anonymousProjects),
                      },
                      {
                        label: "Gästprojekt att städa",
                        value: formatCount(cleanupStats.stats.anonymousProjectsOld),
                      },
                      {
                        label: "Projekt med konto",
                        value: formatCount(cleanupStats.stats.userProjects),
                      },
                      {
                        label: "Filer utan projekt",
                        value: formatCount(cleanupStats.stats.orphanedFiles),
                      },
                      {
                        label: "Bilder utan projekt",
                        value: formatCount(cleanupStats.stats.orphanedImages),
                      },
                      {
                        label: "Utgången cache",
                        value: formatCount(cleanupStats.stats.templateCacheExpired),
                      },
                    ]}
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="gap-2"
                      disabled={busy !== null}
                      onClick={async () => {
                        await run("run-cleanup", "run-cleanup");
                        await loadCleanupStats();
                      }}
                    >
                      {busy === "run-cleanup" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Recycle className="h-4 w-4" />
                      )}
                      Städa nu
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={async () => {
                        await run("cleanup-anonymous-projects", "cleanup-anonymous-projects", {
                          days: 7,
                        });
                        await loadCleanupStats();
                      }}
                    >
                      Ta bort gästprojekt äldre än 7 dagar
                    </Button>
                  </div>
                  {cleanupStats.config && (
                    <TechnicalDetails summary="Visa städningsreglerna">
                      <pre className="bg-muted/40 max-h-60 overflow-auto rounded-md p-3 text-xs">
                        {JSON.stringify(cleanupStats.config, null, 2)}
                      </pre>
                    </TechnicalDetails>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Klicka på “Visa vad som kan städas” för att räkna av utan att ändra något.
                </p>
              )}
            </SectionCard>

            <SectionCard
              title="Riskzon"
              description="Här raderas data permanent. Läs texten i dialogen innan du bekräftar."
              icon={ShieldAlert}
              tone="error"
              className="border-destructive/40"
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Nollställ databasen och cachen</p>
                    <p className="text-muted-foreground text-xs">
                      Tömmer alla tabeller (ditt eget konto och testkontot behålls), tömmer cachen
                      och rensar uppladdade filer. Används för att börja om från noll i en testmiljö.
                    </p>
                  </div>
                  <DangerAction
                    label="Nollställ allt"
                    title="Nollställ databasen och cachen?"
                    description="Alla projekt, konton (utom ditt eget och testkontot), statistik, transaktioner, uppladdade filer och cachenycklar raderas i den här miljön."
                    impact="Det går inte att ångra. Kör aldrig detta mot produktion utan säkerhetskopia."
                    confirmWord="nollställ"
                    disabled={busy !== null}
                    onConfirm={async () => {
                      await run("reset-all", "reset-all");
                    }}
                  />
                </div>
                <Alert>
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>Bulkradering av Vercel-projekt är borttagen</AlertTitle>
                  <AlertDescription>
                    <p>
                      Den gamla “MEGA CLEANUP”-knappen raderade varje projekt som åtkomsttoken
                      kunde se — inklusive Sajtmaskins eget. Radera i stället enskilda kundprojekt
                      under <span className="font-medium">Miljö</span>, där appens eget projekt är
                      skyddat.
                    </p>
                  </AlertDescription>
                </Alert>
              </div>
            </SectionCard>
          </>
        )}
      </DataState>
    </div>
  );
}
