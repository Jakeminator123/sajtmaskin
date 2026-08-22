"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, KeyRound, Loader2, RefreshCw, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import {
  partitionErrorLogsByPass,
  selectActiveErrorLogs,
} from "@/lib/builder/version-diagnostics-summary";
import type { EngineVersionLifecycleStage } from "@/lib/db/engine-version-lifecycle";
import { openDossiersPanel } from "@/lib/builder/project-env-events";
import { describePreviewDiagnosticCode } from "@/lib/gen/preview/diagnostics";
import { dispatchAutoFixEvent } from "@/lib/hooks/chat/auto-fix-events";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type VersionDiagnosticsLog = {
  id: string;
  level: "info" | "warning" | "error" | string;
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
  created_at?: string | null;
};

type DiagnosticsSummary = {
  total: number;
  activeTotal?: number;
  latestPassId?: string | null;
  byLevel?: {
    info?: number;
    warning?: number;
    error?: number;
  };
  activeByLevel?: {
    info?: number;
    warning?: number;
    error?: number;
  };
  byCategory?: Record<string, number>;
  latestPreviewCode?: string | null;
  latestPreviewStage?: string | null;
  latestPreflight?: VersionDiagnosticsLog | null;
  latestQualityGate?: VersionDiagnosticsLog | null;
  latestRender?: VersionDiagnosticsLog | null;
};

type DiagnosticsResponse = {
  success?: boolean;
  logs?: VersionDiagnosticsLog[];
  summary?: DiagnosticsSummary;
  error?: string;
};

const EMPTY_DIAGNOSTICS_LOGS: VersionDiagnosticsLog[] = [];

type Props = {
  chatId: string | null;
  versionId: string | null;
  versionLabel?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * F2 vs F3 lifecycle gate. The "Miljövariabler" shortcut targets a panel
   * that only mounts in F3 — hide it during F2.
   */
  lifecycleStage?: EngineVersionLifecycleStage | null;
};

type BadgeTone = "green" | "yellow" | "red" | "gray";
type LaneStatus = {
  label: string;
  tone: BadgeTone;
};

const RUNTIME_LOG_CATEGORIES = new Set(["preview", "render-telemetry"]);
const PRODUCT_LOG_CATEGORIES = new Set([
  "images",
  "seo",
  "analytics",
  "editorial",
  "business-workflows",
  "navigation",
  "routes",
  "route-plan",
  "project-sanity",
  "react",
]);

function getCategory(log: VersionDiagnosticsLog): string {
  return typeof log.category === "string" ? log.category.trim() : "";
}

function readMetaObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function statusBadgeClass(tone: BadgeTone): string {
  if (tone === "green") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  if (tone === "yellow") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (tone === "red") return "border-red-500/40 bg-red-500/10 text-red-100";
  return "text-muted-foreground";
}

function isProductCategory(category: string): boolean {
  if (!category) return false;
  if (PRODUCT_LOG_CATEGORIES.has(category)) return true;
  return (
    category.startsWith("product_postcheck") ||
    category.startsWith("validate-images") ||
    category.startsWith("quality-gate:product")
  );
}

function levelBadgeVariant(level: string): "default" | "secondary" | "destructive" | "outline" {
  if (level === "error") return "destructive";
  if (level === "warning") return "secondary";
  return "outline";
}

function formatTimestamp(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function groupLogsByCategory(logs: VersionDiagnosticsLog[]) {
  const groups = new Map<string, VersionDiagnosticsLog[]>();
  for (const log of logs) {
    const key = getCategory(log) || "other";
    const entries = groups.get(key) ?? [];
    entries.push(log);
    groups.set(key, entries);
  }
  return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
}

function DiagnosticsLogGroups({ logs }: { logs: VersionDiagnosticsLog[] }) {
  return groupLogsByCategory(logs).map(([category, entries]) => (
    <div key={category} className="rounded-md border border-border/70 bg-background/40">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="font-medium">{category}</div>
        <Badge variant="outline">{entries.length}</Badge>
      </div>
      <div className="space-y-2 p-3">
        {entries.map((log) => (
          <div key={log.id} className="rounded-md border border-border/50 bg-background/60 p-2">
            <div className="flex items-center gap-2">
              <Badge variant={levelBadgeVariant(log.level)}>{log.level}</Badge>
              {formatTimestamp(log.created_at) ? (
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(log.created_at)}
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-sm text-foreground">{log.message}</div>
            {log.meta ? (
              <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 text-[11px] text-muted-foreground">
                {JSON.stringify(log.meta, null, 2)}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  ));
}

export function VersionDiagnosticsDialog({
  chatId,
  versionId,
  versionLabel = null,
  open,
  onOpenChange,
  lifecycleStage = null,
}: Props) {
  const isIntegrations = lifecycleStage === "integrations";
  const [logs, setLogs] = useState<VersionDiagnosticsLog[]>([]);
  const [summary, setSummary] = useState<DiagnosticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataIdentity, setDataIdentity] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestIdentity = chatId && versionId
    ? JSON.stringify([chatId, versionId, reloadToken])
    : null;
  const hasCurrentData = requestIdentity !== null && dataIdentity === requestIdentity;
  const currentLogs = hasCurrentData ? logs : EMPTY_DIAGNOSTICS_LOGS;
  const currentSummary = hasCurrentData ? summary : null;
  const currentError = hasCurrentData ? error : null;
  const isCurrentLoading = Boolean(open && requestIdentity && (!hasCurrentData || isLoading));

  useEffect(() => {
    if (!open || !chatId || !versionId) return;

    let isActive = true;
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setDataIdentity(null);
      try {
        const response = await fetch(
          `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
          { signal: controller.signal },
        );
        const data = (await response.json().catch(() => null)) as DiagnosticsResponse | null;
        if (!response.ok) {
          throw new Error(data?.error || `Failed to load diagnostics (HTTP ${response.status})`);
        }
        if (!isActive) return;
        setLogs(Array.isArray(data?.logs) ? data.logs : []);
        setSummary(data?.summary ?? null);
        setDataIdentity(requestIdentity);
      } catch (loadError) {
        if (!isActive) return;
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setLogs([]);
        setSummary(null);
        setError(loadError instanceof Error ? loadError.message : "Kunde inte ladda diagnostik");
        setDataIdentity(requestIdentity);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void load();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [open, chatId, versionId, reloadToken, requestIdentity]);

  const activeLogs = useMemo(() => {
    return selectActiveErrorLogs(currentLogs, currentSummary?.latestPassId ?? null);
  }, [currentLogs, currentSummary?.latestPassId]);

  const logPartition = useMemo(() => partitionErrorLogsByPass(currentLogs), [currentLogs]);

  const latestPreviewDescription = useMemo(
    () => describePreviewDiagnosticCode(currentSummary?.latestPreviewCode ?? null),
    [currentSummary?.latestPreviewCode],
  );
  const seoLogs = useMemo(
    () => activeLogs.filter((log) => log.category === "seo"),
    [activeLogs],
  );

  const runtimeStatus = useMemo<LaneStatus>(() => {
    const latestPreviewCode =
      typeof currentSummary?.latestPreviewCode === "string"
        ? currentSummary.latestPreviewCode.trim()
        : "";
    if (latestPreviewCode === "preview_ready") {
      return { label: "OK ✓", tone: "green" };
    }
    if (latestPreviewCode === "preview_waiting_for_vm") {
      return { label: "Pending …", tone: "gray" };
    }

    const runtimeLogs = activeLogs.filter((log) => RUNTIME_LOG_CATEGORIES.has(getCategory(log)));
    const hasRuntimeError = runtimeLogs.some((log) => log.level === "error");
    const latestPreflightMeta = readMetaObject(currentSummary?.latestPreflight?.meta);
    const preflightPreviewBlocked =
      typeof latestPreflightMeta?.previewBlocked === "boolean"
        ? latestPreflightMeta.previewBlocked
        : false;
    const preflightPreviewStart = readMetaObject(latestPreflightMeta?.previewStart);
    const canStartPreview =
      typeof preflightPreviewStart?.canStartPreview === "boolean"
        ? preflightPreviewStart.canStartPreview
        : null;

    if (preflightPreviewBlocked || hasRuntimeError) {
      return { label: "Failed ✗", tone: "red" };
    }
    if (canStartPreview === true || latestPreviewCode || runtimeLogs.length > 0) {
      return { label: "Pending …", tone: "gray" };
    }
    return { label: "Pending …", tone: "gray" };
  }, [activeLogs, currentSummary?.latestPreviewCode, currentSummary?.latestPreflight?.meta]);

  const productStatus = useMemo<LaneStatus>(() => {
    const productLogs = activeLogs.filter((log) => isProductCategory(getCategory(log)));
    if (productLogs.length === 0) {
      return { label: "Not run —", tone: "gray" };
    }
    // En skip-rad (även krasch-skip på warning-nivå sedan 2026-08-11) betyder
    // att kontrollen INTE kördes — den är inget produktfynd och får inte
    // räknas som "N warnings" i produkt-lanen (bugbot-fynd på egen diff).
    const ranLogs = productLogs.filter(
      (log) => getCategory(log) !== "product_postcheck.skipped",
    );
    if (ranLogs.length === 0) {
      return { label: "Not run —", tone: "gray" };
    }
    const warningCount = ranLogs.filter(
      (log) => log.level === "warning" || log.level === "error",
    ).length;
    if (warningCount > 0) {
      return { label: `${warningCount} warnings ⚠`, tone: "yellow" };
    }
    return { label: "OK ✓", tone: "green" };
  }, [activeLogs]);

  const buildStatus = useMemo<LaneStatus>(() => {
    const checks: Record<"typecheck" | "build" | "lint", "unknown" | "passed" | "failed"> = {
      typecheck: "unknown",
      build: "unknown",
      lint: "unknown",
    };

    for (const log of activeLogs) {
      const category = getCategory(log);
      if (category === "preflight:quality-gate") {
        const meta = readMetaObject(log.meta);
        const metaChecks = Array.isArray(meta?.checks) ? meta.checks : [];
        for (const check of metaChecks) {
          const checkMeta = readMetaObject(check);
          const checkName = checkMeta?.check;
          const checkPassed = checkMeta?.passed;
          if (
            (checkName === "typecheck" || checkName === "build" || checkName === "lint") &&
            typeof checkPassed === "boolean"
          ) {
            checks[checkName] = checkPassed ? "passed" : "failed";
          }
        }
      }
      if (!category.startsWith("quality-gate:")) continue;
      const checkName = category.slice("quality-gate:".length);
      if (checkName !== "typecheck" && checkName !== "build" && checkName !== "lint") continue;
      if (log.level === "error") {
        checks[checkName] = "failed";
      } else if (checks[checkName] === "unknown" && log.level === "info") {
        checks[checkName] = "passed";
      }
    }

    const known =
      checks.typecheck !== "unknown" || checks.build !== "unknown" || checks.lint !== "unknown";
    const failedTypecheck = checks.typecheck === "failed";
    const failedBuildOrLint = checks.build === "failed" || checks.lint === "failed";
    const allF3ChecksPassed =
      checks.typecheck === "passed" &&
      checks.build === "passed" &&
      checks.lint === "passed";

    if (failedTypecheck) {
      return { label: "Failed ✗", tone: "red" };
    }
    if (failedBuildOrLint) {
      // F2 may still be fine while F3 build/lint is not.
      return { label: "Failed ✗", tone: "yellow" };
    }
    if (allF3ChecksPassed) {
      return { label: "OK ✓", tone: "green" };
    }
    if (!known) {
      return { label: "Unchecked —", tone: "gray" };
    }
    // Typical F2 state: typecheck done, build/lint not executed yet.
    return { label: "Unchecked —", tone: "gray" };
  }, [activeLogs]);

  // En överhoppad Postcheck (kraschad Chromium//tmp-svält) är infrastruktur —
  // den kan aldrig lagas av en kodreparation och får varken låsa upp knappen
  // eller skickas som repair-orsak (bugbot-fynd 2026-08-11, när krasch-skips
  // började loggas som warning).
  const isAutoFixableLog = (log: VersionDiagnosticsLog) =>
    (log.level === "error" || log.level === "warning") &&
    log.category !== "product_postcheck.skipped";
  const canAutoFix = activeLogs.some(isAutoFixableLog);

  const handleAutoFix = () => {
    if (!chatId || !versionId) return;
    const reasons = Array.from(
      new Set(
        activeLogs
          .filter(isAutoFixableLog)
          .slice(0, 5)
          .map((log) => log.message.trim())
          .filter(Boolean),
      ),
    );
    dispatchAutoFixEvent({
      chatId,
      versionId,
      reasons: reasons.length > 0 ? reasons : ["diagnostic issue"],
      // Explicit user click: bypass the automatic per-chat / per-reason caps so
      // the button the cap-toast tells users to press actually runs.
      manual: true,
      meta: { source: "version-diagnostics" },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Versionsdiagnostik</DialogTitle>
          <DialogDescription>
            Samlar verifiering, previewfel och andra loggar. Vald version:{" "}
            <span className="font-medium text-foreground">{versionLabel ?? versionId ?? "okänd"}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={statusBadgeClass(runtimeStatus.tone)}>
            Runtime: {runtimeStatus.label}
          </Badge>
          <Badge variant="outline" className={statusBadgeClass(productStatus.tone)}>
            Product: {productStatus.label}
          </Badge>
          <Badge variant="outline" className={statusBadgeClass(buildStatus.tone)}>
            Build: {buildStatus.label}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Loggar: {currentSummary?.activeTotal ?? activeLogs.length}</Badge>
          <Badge variant="outline">Loggfel: {currentSummary?.activeByLevel?.error ?? 0}</Badge>
          <Badge variant="outline">Varningar: {currentSummary?.activeByLevel?.warning ?? 0}</Badge>
          <Badge variant="outline">Info: {currentSummary?.activeByLevel?.info ?? 0}</Badge>
          {currentSummary?.latestPreviewCode ? (
            <Badge variant="secondary">Preview-kod: {currentSummary.latestPreviewCode}</Badge>
          ) : null}
          {currentSummary?.latestPreviewStage ? (
            <Badge variant="outline">Preview-steg: {currentSummary.latestPreviewStage}</Badge>
          ) : null}
        </div>

        {latestPreviewDescription ? (
          <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-sm text-blue-100">
            Senaste preview-diagnos: {latestPreviewDescription}
          </div>
        ) : null}
        {seoLogs.length > 0 ? (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-100">
            SEO review: {seoLogs.length} loggpost(er) med SEO-varningar finns för den här versionen.
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {isIntegrations ? (
            <Button variant="outline" size="sm" onClick={() => openDossiersPanel()}>
              <KeyRound className="mr-1 h-4 w-4" />
              Miljövariabler
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReloadToken((value) => value + 1)}
            disabled={isLoading}
          >
            <RefreshCw className={cn("mr-1 h-4 w-4", isLoading && "animate-spin")} />
            Ladda om
          </Button>
          <Button size="sm" onClick={handleAutoFix} disabled={!canAutoFix}>
            <Wrench className="mr-1 h-4 w-4" />
            Kör autofix
          </Button>
        </div>

        <ScrollArea className="max-h-[60vh] rounded-md border">
          <div className="space-y-3 p-3">
            {isCurrentLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laddar diagnostik...
              </div>
            ) : currentError ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-200">
                {currentError}
              </div>
            ) : currentLogs.length === 0 ? (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-100">
                Inga sparade fel eller varningar för den här versionen ännu.
              </div>
            ) : (
              <>
                {logPartition.latestPassId ? (
                  <section aria-labelledby="current-pass-heading" className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 id="current-pass-heading" className="text-sm font-semibold">Aktuellt körpass</h3>
                      <Badge variant="outline">{logPartition.latestPassLogs.length}</Badge>
                    </div>
                    <DiagnosticsLogGroups logs={logPartition.latestPassLogs} />
                  </section>
                ) : null}

                {logPartition.unscopedLogs.length > 0 ? (
                  <section aria-labelledby="unscoped-heading" className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 id="unscoped-heading" className="text-sm font-semibold">
                        Observationer utan körpass
                      </h3>
                      <Badge variant="outline">{logPartition.unscopedLogs.length}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Dessa loggar saknar pass-id och kopplas därför inte till ett specifikt körpass.
                    </p>
                    <DiagnosticsLogGroups logs={logPartition.unscopedLogs} />
                  </section>
                ) : null}

                {logPartition.historicalPasses.length > 0 ? (
                  <section aria-labelledby="historical-heading" className="space-y-2">
                    <h3 id="historical-heading" className="text-sm font-semibold">Historiska körpass</h3>
                    {logPartition.historicalPasses.map((pass) => (
                      <details key={pass.passId} className="rounded-md border border-border/70 bg-background/30">
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                          Tidigare körpass · {pass.passId} ({pass.logs.length})
                        </summary>
                        <div className="space-y-2 border-t border-border/60 p-3">
                          <DiagnosticsLogGroups logs={pass.logs} />
                        </div>
                      </details>
                    ))}
                  </section>
                ) : null}
              </>
            )}

            {!isCurrentLoading && !currentError && activeLogs.some((log) => log.level === "error") ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-100">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    Den här versionen har fel loggade. Kör autofix om du vill skicka en reparationsprompt
                    baserad på de senaste problemen.
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
