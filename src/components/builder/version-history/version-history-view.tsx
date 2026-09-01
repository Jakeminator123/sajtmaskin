"use client";

import {
  resolveEngineVersionVerificationSurfaceStatus,
  resolveQualityTier,
} from "@/lib/db/engine-version-lifecycle";
import { mapVersionStatusToDisplay } from "@/lib/builder/version-status-display";
import {
  resolveVersionHistorySummary,
  versionHistoryStatusBadge,
  shouldShowVerifiedBadge,
} from "@/lib/builder/version-history-status-labels";
import { isTier2LivePreviewUrl, normalizePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  GitBranch,
  Loader2,
  MessageSquare,
  Pin,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { VersionHistoryProps } from "./types";
import { versionRowSortKey } from "./helpers";
import { useVersionHistoryActions } from "./use-version-history-actions";
import { VersionHistoryDialogs } from "./version-history-dialogs";

export function VersionHistory({
  chatId,
  selectedVersionId,
  activePreviewSessionId = null,
  onVersionSelect,
  onPreviewResync,
  isCollapsed = false,
  onToggleCollapse,
  versions: externalVersions,
  mutateVersions: externalMutate,
  lifecycleStage = null,
  selectDisabled = false,
}: VersionHistoryProps) {
  const {
    user,
    isAuthenticated,
    hasGitHub,
    versions,
    isLoading,
    versionList,
    pinnedCount,
    latestRowSortKey,
    versionLabelById,
    primaryRepairVersion,
    downloadingVersionId,
    exportingVersionId,
    githubExportVersionId,
    setGithubExportVersionId,
    disconnectingGitHub,
    pinningVersionId,
    diagnosticsVersionId,
    setDiagnosticsVersionId,
    compareVersionId,
    setCompareVersionId,
    collaborationVersionId,
    setCollaborationVersionId,
    confirmRestoreVersion,
    setConfirmRestoreVersion,
    restoringVersionId,
    acceptingRepairVersionId,
    returnTo,
    syncingElapsed,
    collaborationSummaries,
    selectedPreviewStatus,
    formatVersionTime,
    handleDownload,
    handleExportToBlob,
    handleOpenGitHubExport,
    handleDisconnectGitHub,
    handleTogglePin,
    performRestore,
    handleRestoreClick,
    handleAcceptRepair,
  } = useVersionHistoryActions({
    chatId,
    selectedVersionId,
    activePreviewSessionId,
    onVersionSelect,
    onPreviewResync,
    versions: externalVersions,
    mutateVersions: externalMutate,
  });

  const canToggleCollapse = typeof onToggleCollapse === "function";

  // Infällt läge ägs av builder-shellen (smal fäll-ut-remsa) — panelen
  // renderar ingenting själv. Header-knappen "Versioner" är borttagen.
  if (isCollapsed) {
    return null;
  }

  if (!chatId) {
    return (
      <div className="flex h-full flex-col">
        {canToggleCollapse && (
          <div className="flex justify-end px-2 py-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleCollapse}
              title="Fäll in versioner"
              aria-label="Fäll in versioner"
              className="h-7 w-7"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="text-muted-foreground flex flex-1 items-center justify-center p-4">
          <p className="text-center text-sm">Skicka ett meddelande för att starta ett projekt</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-3 w-3/4" />
              <div className="mt-2 flex gap-1">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-7 w-7 rounded-md" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (versions.length === 0) {
    const showSyncing = Boolean(chatId) && !syncingElapsed;
    return (
      <div className="flex h-full flex-col">
        {canToggleCollapse && (
          <div className="flex justify-end px-2 py-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleCollapse}
              title="Fäll in versioner"
              aria-label="Fäll in versioner"
              className="h-7 w-7"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="text-muted-foreground flex flex-1 items-center justify-center p-4">
          <p className="text-center text-sm" suppressHydrationWarning>
            {showSyncing
              ? "Synkar versionshistorik..."
              : "Inga versioner ännu. Generera en sida för att skapa en version."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">Versionshistorik</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              {versions.length} version{versions.length !== 1 ? "er" : ""}
              {pinnedCount > 0 ? ` • ${pinnedCount} pinned` : ""}
            </p>
            <p className="text-muted-foreground text-xs">
              Pinned versions är skrivskyddade snapshots. Avpinna för att kunna redigera.
            </p>
          </div>
          {canToggleCollapse && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleCollapse}
              title="Fäll in versioner"
              aria-label="Fäll in versioner"
              className="h-7 w-7"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {isAuthenticated ? (
            hasGitHub ? (
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="gap-1">
                  <GitBranch className="h-3 w-3" />
                  GitHub kopplat{user?.github_username ? ` • @${user.github_username}` : ""}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnectGitHub}
                  disabled={disconnectingGitHub}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {disconnectingGitHub ? "Kopplar från…" : "Koppla från"}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(
                    `/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
                className="h-7 px-2 text-xs"
              >
                <GitBranch className="h-3 w-3" />
                Koppla GitHub
              </Button>
            )
          ) : (
            <span className="text-muted-foreground">Logga in för att koppla GitHub</span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {primaryRepairVersion && (
          <div className="mb-2 rounded-lg border border-indigo-500/50 bg-indigo-500/10 p-3 text-xs text-indigo-700 dark:text-indigo-200">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Serverreparation klar att granska
            </div>
            <p className="mt-1 text-indigo-700/80 dark:text-indigo-200/80">
              Vi lagade verifieringsfel i en ny version. Den nuvarande previewn ligger kvar tills
              du accepterar fixen. Accepteras automatiskt efter en stund om du inte svarar.
            </p>
            <Button
              size="sm"
              onClick={(e) => handleAcceptRepair(e, primaryRepairVersion)}
              disabled={
                selectDisabled ||
                acceptingRepairVersionId !== null ||
                restoringVersionId !== null
              }
              className="mt-2 h-7 px-2 text-xs"
            >
              {acceptingRepairVersionId !== null ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle className="mr-1 h-3 w-3" />
              )}
              Acceptera fix
            </Button>
          </div>
        )}
        <div className="space-y-2">
          {versionList.map((version, index) => {
            const selectableVersionId = version.versionId || version.id || "";
            const internalVersionId =
              typeof version.id === "string" && version.id.trim()
                ? version.id
                : typeof version.versionId === "string" && version.versionId.trim()
                  ? version.versionId
                  : undefined;
            const isDownloading = downloadingVersionId === internalVersionId;
            const isExporting = exportingVersionId === internalVersionId;
            const isPinning = pinningVersionId === internalVersionId;
            const isRestoring = restoringVersionId === internalVersionId;
            const isSelected = selectedVersionId === selectableVersionId;
            const isPinned = Boolean(version.pinned);
            const canPin = version.canPin !== false;
            const canRestore = canPin === false;
            const canRollback =
              canRestore &&
              (version.releaseState === "promoted" || version.verificationState === "passed");
            const hasPendingRepair =
              version.hasPendingRepair === true || version.verificationState === "repair_available";
            const isAcceptingRepair = acceptingRepairVersionId === internalVersionId;
            // OMTAG-06 / område 6-2: the lifecycle badge now derives from the
            // canonical event-bus projection — `busStatus` is enriched per row
            // by the /versions route via `selectVersionStatus(readAll(id))` —
            // instead of the now-removed DB-flag resolver
            // `resolveEngineVersionDisplayStatus`. `mapVersionStatusToDisplay`
            // adds the chat-context derivations (`retrying` when superseded,
            // `promoted` from release-state) plus the false-green guard
            // (a degraded run never renders as clean success).
            const lifecycleDisplay = mapVersionStatusToDisplay(version.busStatus ?? null, {
              isLatest: versionRowSortKey(version) === latestRowSortKey,
              releaseState: version.releaseState,
            });
            const lifecycleStatus = lifecycleDisplay.status;
            const verificationSurfaceStatus = resolveEngineVersionVerificationSurfaceStatus({
              releaseState: version.releaseState,
              verificationState: version.verificationState,
              lifecycleStage: version.lifecycleStage,
            });
            const isEngineVersionRow =
              version.canPin === false || typeof version.versionNumber === "number";
            const tier2PreviewNorm = normalizePreviewUrl(version.previewUrl);
            const hasTier2LivePreviewForRow = Boolean(
              tier2PreviewNorm && isTier2LivePreviewUrl(tier2PreviewNorm),
            );
            const qualityTier = resolveQualityTier(
              {
                releaseState: version.releaseState,
                verificationState: version.verificationState,
              },
              isEngineVersionRow
                ? { hasTier2LivePreviewUrl: hasTier2LivePreviewForRow }
                : { hasDemoUrl: Boolean(version.demoUrl) },
            );
            const listPreviewUrl =
              (tier2PreviewNorm && isTier2LivePreviewUrl(tier2PreviewNorm) ? tier2PreviewNorm : null) ??
              normalizePreviewUrl(version.demoUrl);
            const hasPreviewSurface = Boolean(listPreviewUrl);
            const verifiedForRow = shouldShowVerifiedBadge(
              verificationSurfaceStatus,
              lifecycleDisplay.degraded,
            );
            const baseLifecycleBadge = versionHistoryStatusBadge(lifecycleDisplay);
            const lifecycleBadge =
              lifecycleStatus === "ready" && (!verifiedForRow || !hasPreviewSurface)
                ? hasPreviewSurface
                  ? {
                      ...baseLifecycleBadge,
                      label: "Preview startad",
                      variant: "outline" as const,
                      className:
                        "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
                      tooltip:
                        "Preview-URL finns, men versionen är inte verifierad som helhet ännu. Läs verify/VM-chipsen bredvid.",
                    }
                  : {
                      ...baseLifecycleBadge,
                      label: "Sparad, preview saknas",
                      variant: "outline" as const,
                      className:
                        "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
                      tooltip:
                        "Versionen är sparad, men ingen live-preview/preview-URL finns för raden ännu.",
                    }
                : baseLifecycleBadge;
            const qualityTierLabel =
              qualityTier === "tier2"
                ? "Live-preview startad"
                : qualityTier === "preview"
                  ? "Preview-URL finns"
                  : null;
            const qualityTierBadgeClass =
              qualityTier === "tier2"
                ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                : qualityTier === "preview"
                  ? "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300"
                  : undefined;
            const verificationBadge =
              verifiedForRow
                ? {
                    label: "Verifierad",
                    title: "Server-verify eller promotion har passerat för denna version.",
                    className:
                      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  }
                : verificationSurfaceStatus === "design_ready"
                  ? {
                      label: "Ej verifierad",
                      title:
                        "Designversion: preview kan vara startad, men server-verify körs först vid Bygg integrationer.",
                      className:
                        "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
                    }
                  : verificationSurfaceStatus === "verifying"
                    ? {
                        label: "Verifierar",
                        title: "Server-verify kör fortfarande för denna version.",
                        className:
                          "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
                      }
                    : verificationSurfaceStatus === "repair_available"
                      ? {
                          label: "Fix redo",
                          title:
                            "Serverreparation finns men är inte accepterad ännu.",
                          className:
                            "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
                        }
                      : verificationSurfaceStatus === "failed"
                        ? {
                            label: "Ej verifierad",
                            title: "Verifiering hittade blockerande fel.",
                            className:
                              "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
                          }
                        : verificationSurfaceStatus === "superseded"
                          ? {
                              label: "Ersatt",
                              title:
                                "En nyare version tog över innan verifieringen hann bli klar. Inte ett fel — den nyare versionen gäller.",
                              className:
                                "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                            }
                          : null;
            const runtimeStatusForRow =
              isSelected && isEngineVersionRow ? selectedPreviewStatus?.status ?? null : null;
            const runtimeBadge =
              runtimeStatusForRow === "running"
                ? {
                    label: "VM live",
                    className:
                      verifiedForRow
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
                  }
                : runtimeStatusForRow === "starting"
                  ? {
                      label: "VM startar",
                      className:
                        "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
                    }
                  : runtimeStatusForRow === "stopped"
                    ? {
                        label: "VM stoppad",
                        className:
                          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                      }
                    : runtimeStatusForRow === "version_mismatch"
                      ? {
                          label: "VM annan version",
                          className:
                            "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
                        }
                      : runtimeStatusForRow === "missing"
                        ? {
                            label: "VM saknas",
                            className:
                              "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
                          }
                        : runtimeStatusForRow === "build_error"
                          ? {
                              label: "VM byggfel",
                              className:
                                "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
                            }
                          : null;
            const lifecycleSummary = resolveVersionHistorySummary(
              lifecycleDisplay,
              version.verificationSummary,
            );

            return (
              <Card
                key={internalVersionId ?? `version-${version.createdAt ?? "unknown"}-${index}`}
                onClick={() => {
                  if (selectDisabled || !selectableVersionId) return;
                  onVersionSelect(selectableVersionId);
                }}
                title={
                  selectDisabled
                    ? "Vänta tills versionen är kontrollerad innan du byter"
                    : undefined
                }
                className={cn(
                  "transition-colors",
                  selectDisabled
                    ? "cursor-not-allowed"
                    : "cursor-pointer",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : !selectDisabled && "hover:border-border hover:bg-accent/50",
                )}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Clock className="text-muted-foreground h-3 w-3" />
                        <span className="text-muted-foreground text-xs">
                          {formatVersionTime(version.createdAt)}
                        </span>
                        {(() => {
                          const derivedLabel = internalVersionId
                            ? versionLabelById.get(internalVersionId)
                            : undefined;
                          const versionLabel =
                            derivedLabel ??
                            (typeof version.versionNumber === "number"
                              ? `v${version.versionNumber}`
                              : null);
                          if (!versionLabel) return null;
                          const isQuickEdit = version.editKind === "quick_edit";
                          return (
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[10px]"
                              title={
                                isQuickEdit
                                  ? "Snabbredigering (direkt filändring, ingen ombyggnad)"
                                  : undefined
                              }
                            >
                              {versionLabel}
                            </Badge>
                          );
                        })()}
                        {version.editKind === "imported_repo" && (
                          <Badge
                            variant="outline"
                            className="border-teal-500/40 bg-teal-500/10 px-1.5 py-0 text-[10px] text-teal-700 dark:text-teal-300"
                            title="Importerad basversion — templaten/repot importerades ordagrant (verbatim), ingen AI-generering. Nästa prompt bygger vidare på den."
                          >
                            Importerad
                          </Badge>
                        )}
                        <Badge
                          variant={lifecycleBadge.variant}
                          className={cn("gap-1 px-1.5 py-0 text-[10px]", lifecycleBadge.className)}
                          title={lifecycleBadge.tooltip}
                        >
                          {lifecycleBadge.spinner && <Loader2 className="h-3 w-3 animate-spin" />}
                          {lifecycleBadge.retryIcon && <RotateCcw className="h-3 w-3" />}
                          {lifecycleBadge.label}
                        </Badge>
                        {qualityTierLabel && (
                          <Badge
                            variant="outline"
                            className={cn("px-1.5 py-0 text-[10px]", qualityTierBadgeClass)}
                            title="Runtime/preview-status: detta säger att en preview-URL eller VM-yta finns, inte att versionen är server-verifierad."
                          >
                            {qualityTierLabel}
                          </Badge>
                        )}
                        {isEngineVersionRow && verificationBadge && (
                          <Badge
                            variant="outline"
                            className={cn("px-1.5 py-0 text-[10px]", verificationBadge.className)}
                            title={verificationBadge.title}
                          >
                            {verificationBadge.label}
                          </Badge>
                        )}
                        {runtimeBadge && (
                          <Badge
                            variant="outline"
                            className={cn("px-1.5 py-0 text-[10px]", runtimeBadge.className)}
                            title={
                              runtimeStatusForRow === "version_mismatch"
                                ? "Preview-VM kör en annan version än den valda. Vänta på återstart eller öppna preview-panelen för status."
                                : runtimeStatusForRow === "missing"
                                  ? "Ingen aktiv preview-VM för denna version. Starta en ny preview-session från knappraden."
                                  : runtimeStatusForRow === "starting"
                                    ? "Preview-VM startar — `npm install` + `next dev` kör i bakgrunden. Vanligtvis 30–90 s vid kall start."
                                    : runtimeStatusForRow === "stopped"
                                      ? "Preview-VM är stoppad. Starta en ny preview-session från knappraden för att återanvända versionen."
                                      : runtimeStatusForRow === "build_error"
                                        ? "Preview-VM startade men sidan svarar med ett byggfel (Next.js build error / HTTP 500). En omstart hjälper inte — koden måste åtgärdas."
                                        : "Preview-VM körs (Next.js dev-server svarar)."
                            }
                          >
                            {runtimeBadge.label}
                          </Badge>
                        )}
                        {isPinned && (
                          <Badge
                            variant="secondary"
                            className="px-1.5 py-0 text-[10px]"
                            title="Pinnad version — visas alltid överst i listan tills du unpinnar."
                          >
                            Pinned
                          </Badge>
                        )}
                        {internalVersionId && (() => {
                          const s = collaborationSummaries[internalVersionId];
                          const status = s?.approvalStatus ?? null;
                          const unresolved = s?.unresolvedCount ?? 0;
                          return (
                            <>
                              {status === "pending" && (
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                                  title="Väntar på godkännande"
                                />
                              )}
                              {status === "approved" && (
                                <span title="Godkänd"><CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" /></span>
                              )}
                              {unresolved > 0 && (
                                <Badge
                                  variant="outline"
                                  className="cursor-pointer px-1.5 py-0 text-[10px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCollaborationVersionId(internalVersionId);
                                  }}
                                >
                                  <MessageSquare className="mr-0.5 h-3 w-3" />
                                  {unresolved}
                                </Badge>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      {lifecycleSummary && lifecycleStatus !== "promoted" && (
                        <p className="text-muted-foreground mb-1 line-clamp-2 text-xs">
                          {lifecycleSummary}
                        </p>
                      )}
                      {listPreviewUrl && (
                        <p
                          className="text-muted-foreground truncate text-xs"
                          title={listPreviewUrl}
                        >
                          {listPreviewUrl}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {listPreviewUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 px-2 text-xs"
                      >
                        <a href={listPreviewUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1 h-3 w-3" />
                          Visa
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (internalVersionId) setCompareVersionId(internalVersionId);
                      }}
                      title="Jämför med föregående version"
                      aria-label="Jämför med föregående version"
                      className="h-7 px-2 text-xs"
                    >
                      Jämför
                    </Button>
                    {canRestore && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleRestoreClick(e, version)}
                        disabled={selectDisabled || isRestoring}
                        title={canRollback ? "Rollback som ny draftversion" : "Återställ som ny draftversion"}
                        aria-label={canRollback ? "Rollback som ny draftversion" : "Återställ som ny draftversion"}
                        className="h-7 px-2 text-xs"
                      >
                        {isRestoring ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="mr-1 h-3 w-3" />
                        )}
                        {canRollback ? "Rollback" : "Återställ"}
                      </Button>
                    )}
                    {hasPendingRepair && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={(e) => handleAcceptRepair(e, version)}
                        disabled={selectDisabled || isAcceptingRepair || isRestoring}
                        title="Acceptera serverreparation"
                        aria-label="Acceptera serverreparation"
                        className="h-7 px-2 text-xs"
                      >
                        {isAcceptingRepair ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle className="mr-1 h-3 w-3" />
                        )}
                        Acceptera fix
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (internalVersionId) setDiagnosticsVersionId(internalVersionId);
                      }}
                      title="Visa diagnostik"
                      aria-label="Visa diagnostik"
                      className="h-7 w-7"
                    >
                      <AlertCircle className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (internalVersionId) setCollaborationVersionId(internalVersionId);
                      }}
                      title="Kommentarer och godkännande"
                      aria-label="Kommentarer och godkännande"
                      className="h-7 w-7"
                    >
                      <MessageSquare className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => handleDownload(e, version)}
                      disabled={isDownloading}
                      title="Ladda ner version"
                      aria-label="Ladda ner version"
                      className="h-7 w-7"
                    >
                      {isDownloading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => handleExportToBlob(e, version)}
                      disabled={isExporting}
                      title="Exportera bilder till bildlagring"
                      aria-label="Exportera bilder till bildlagring"
                      className="h-7 w-7"
                    >
                      {isExporting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <UploadCloud className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => handleOpenGitHubExport(e, version)}
                      title="Exportera till GitHub"
                      aria-label="Exportera till GitHub"
                      className="h-7 w-7"
                    >
                      <GitBranch className="h-3 w-3" />
                    </Button>
                    {canPin && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => handleTogglePin(e, version)}
                        disabled={isPinning}
                        title={isPinned ? "Unpin version" : "Pin version"}
                        aria-label={isPinned ? "Unpin version" : "Pin version"}
                        className="h-7 w-7"
                      >
                        {isPinning ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Pin className={cn("h-3 w-3", isPinned ? "text-primary" : "")} />
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      <VersionHistoryDialogs
        chatId={chatId}
        lifecycleStage={lifecycleStage}
        versionList={versionList}
        versionLabelById={versionLabelById}
        diagnosticsVersionId={diagnosticsVersionId}
        setDiagnosticsVersionId={setDiagnosticsVersionId}
        compareVersionId={compareVersionId}
        setCompareVersionId={setCompareVersionId}
        collaborationVersionId={collaborationVersionId}
        setCollaborationVersionId={setCollaborationVersionId}
        confirmRestoreVersion={confirmRestoreVersion}
        setConfirmRestoreVersion={setConfirmRestoreVersion}
        restoringVersionId={restoringVersionId}
        performRestore={performRestore}
        githubExportVersionId={githubExportVersionId}
        setGithubExportVersionId={setGithubExportVersionId}
        hasGitHub={hasGitHub}
        isAuthenticated={isAuthenticated}
        githubUsername={user?.github_username ?? null}
      />
    </div>
  );
}
