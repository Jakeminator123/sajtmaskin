"use client";

import { Boxes, ChevronRight, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  describeDossierStatus,
  describeEnvKeyValueState,
  type DossierOverviewEntry,
} from "@/lib/builder/dossier-overview";
import {
  DOSSIER_ENV_ENFORCEMENT_LABELS,
  describeDossierClass,
  describeDossierMockMode,
} from "@/lib/builder/dossier-axes";
import { resolveDossierGroup } from "@/lib/builder/dossier-groups";
import { cn } from "@/lib/utils";
import type { usePreviewPanelDossiersController } from "./usePreviewPanelDossiersController";
import { DossierCatalogStagingView } from "./DossierCatalogStagingView";
import {
  describeActiveVersionLabel,
  describeDossierNextAction,
  GROUP_HEADING_TITLE,
  RequiresF3Badge,
  TONE_BADGE_CLASS,
  type PanelTab,
} from "./dossiers-shared";

type Vm = ReturnType<typeof usePreviewPanelDossiersController> & {
  className?: string;
  activeVersionMeta?: { versionNumber?: number | null; createdAt?: string | Date | null } | null;
  /** Fallback when `activeVersionMeta` lags the selected id (see describeActiveVersionLabel). */
  versionId?: string | null;
};

export function DossiersPanelView({
  className,
  activeVersionMeta,
  versionId,
  ...vm
}: Vm) {
  const {
    onRequestDossier,
    catalogPickDisabled,
    open,
    activeTab,
    setActiveTab,
    loading,
    error,
    expandedId,
    setExpandedId,
    freshData,
    stage,
    count,
    customFocusKeys,
    customKeyDraft,
    setCustomKeyDraft,
    customKeyDraftError,
    customSaving,
    customError,
    customSaveConfirmation,
    keyValues,
    setKeyValues,
    editingKeys,
    setEditingKeys,
    savingDossierId,
    saveError,
    saveConfirmation,
    deletingKey,
    projectId,
    handleSaveKeys,
    handleDeleteKey,
    handleSaveCustomKeys,
    handleAddCustomKey,
    catalogData,
    catalogLoading,
    catalogError,
    loadCatalog,
    pickedEntry,
    stagingConfirmed,
    handleOpenChange,
    handleSelectCatalogDossier,
    handleCancelStagedDossier,
    handleConfirmStagedDossier,
    handleSaveStagedKeys,
    needsAttention,
    groupedDossiers,
    catalogClassFilter,
    setCatalogClassFilter,
    catalogCounts,
    filteredCatalogGroups,
  } = vm;

  const activeVersionLabel = describeActiveVersionLabel(activeVersionMeta, versionId);

  const headerMeta =
    activeTab === "catalog" && catalogData
      ? `Katalog: ${catalogCounts.total} totalt · ${catalogCounts.hard} externa · ${catalogCounts.soft} utan tjänst`
      : activeTab === "catalog" && catalogLoading
        ? "Katalog: läser…"
        : freshData && activeVersionLabel
          ? activeVersionLabel
          : "Välj, se status och fyll i nycklar för sajtens byggblock.";

  const renderRow = (entry: DossierOverviewEntry) => {
    const descriptor = describeDossierStatus(entry.status, stage, entry.class);
    const classDescriptor = describeDossierClass(entry.class);
    const mockDescriptor = describeDossierMockMode(entry.mock);
    const nextAction = describeDossierNextAction(entry, descriptor);
    const isExpanded = expandedId === entry.id;
    const labelId = `dossier-label-${entry.id}`;
    const detailsId = `dossier-details-${entry.id}`;
    return (
      <li key={entry.id} className="rounded-lg border border-gray-800 bg-black/20">
        <button
          type="button"
          onClick={() => setExpandedId(isExpanded ? null : entry.id)}
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-800/40"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "h-4 w-4 shrink-0 text-gray-500 motion-reduce:transition-none",
              isExpanded && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1">
            <span id={labelId} className="block truncate text-sm font-medium text-gray-100">
              {entry.label}
            </span>
            <span className="mt-0.5 block truncate text-xs text-gray-500">
              {resolveDossierGroup(entry.capability).label}
            </span>
          </span>
          <Badge
            variant="outline"
            className={cn("text-[11px]", TONE_BADGE_CLASS[descriptor.tone])}
            title={descriptor.hint}
          >
            {descriptor.label}
          </Badge>
        </button>
        {isExpanded ? (
          <div
            id={detailsId}
            role="region"
            aria-labelledby={labelId}
            className="space-y-3 border-t border-gray-800 px-3 py-3 text-xs text-gray-300"
          >
            <p className="text-sm leading-relaxed text-gray-400">
              {entry.summarySv ?? entry.summary}
            </p>
            <div className="flex flex-wrap gap-1.5 text-xs text-gray-500">
              <span className="rounded-md bg-gray-800/60 px-2 py-1" title={classDescriptor.hint}>
                {classDescriptor.label}
              </span>
              {entry.class === "hard" ? (
                <span className="rounded-md bg-gray-800/60 px-2 py-1" title={mockDescriptor.hint}>
                  Demoläge: {mockDescriptor.label}
                </span>
              ) : null}
              <span className="rounded-md bg-gray-800/60 px-2 py-1">
                Komplexitet: {entry.complexity}
              </span>
            </div>
            {nextAction ? (
              <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-amber-200">
                <span className="mb-0.5 block text-[11px] font-medium tracking-wide text-amber-300/80 uppercase">
                  Nästa steg
                </span>
                {nextAction}
              </p>
            ) : null}
            {entry.envVars.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium text-gray-400">Env-nycklar</p>
                <ul className="space-y-3">
                  {entry.envVars.map((env) => {
                    const valueState = describeEnvKeyValueState(env);
                    return (
                      <li key={env.key} className="space-y-1.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <code className="rounded-md bg-gray-800/60 px-1.5 py-0.5 text-[11px] text-gray-200">
                            {env.key}
                          </code>
                          <span className="text-[11px] text-gray-500">
                            {DOSSIER_ENV_ENFORCEMENT_LABELS[env.enforcement]}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", TONE_BADGE_CLASS[valueState.tone])}
                            title={valueState.hint}
                          >
                            {valueState.label}
                          </Badge>
                        </span>
                        <span className="flex items-start justify-between gap-3 text-xs text-gray-400">
                          <span>{env.purpose}</span>
                          {env.setupUrl ? (
                            <a
                              href={env.setupUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 text-sky-300 hover:text-sky-200"
                            >
                              Hämta värde
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                          ) : null}
                        </span>
                        {!env.hasRealValue || editingKeys.has(env.key) ? (
                          <span className="flex items-center gap-2">
                            <KeyRound className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                            <Input
                              type="password"
                              autoComplete="off"
                              spellCheck={false}
                              aria-label={`Värde för ${env.key}`}
                              value={keyValues[env.key] ?? ""}
                              disabled={!projectId || savingDossierId !== null}
                              onChange={(event) =>
                                setKeyValues((current) => ({
                                  ...current,
                                  [env.key]: event.target.value,
                                }))
                              }
                              placeholder={
                                projectId
                                  ? env.hasRealValue
                                    ? "Klistra in nytt värde"
                                    : "Klistra in riktigt värde"
                                  : "Projekt saknas"
                              }
                              className="h-8 border-gray-700 bg-black/30 text-xs"
                            />
                          </span>
                        ) : (
                          <span className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setEditingKeys((current) => new Set(current).add(env.key))
                              }
                              className="text-xs text-sky-300 hover:text-sky-200"
                            >
                              Ändra värde
                            </button>
                            <button
                              type="button"
                              disabled={!projectId || deletingKey !== null || savingDossierId !== null}
                              onClick={() => void handleDeleteKey(entry, env.key)}
                              className="text-xs text-rose-300 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingKey === env.key ? "Tar bort…" : "Ta bort"}
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {entry.envVars.some((env) => !env.hasRealValue || editingKeys.has(env.key)) ? (
                  <div className="mt-3 space-y-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      disabled={
                        !projectId ||
                        savingDossierId !== null ||
                        !entry.envVars.some(
                          (env) =>
                            (!env.hasRealValue || editingKeys.has(env.key)) &&
                            (keyValues[env.key] ?? "").trim().length > 0,
                        )
                      }
                      onClick={() => void handleSaveKeys(entry)}
                    >
                      {savingDossierId === entry.id ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Spara nyckel
                    </Button>
                    {!projectId ? (
                      <p className="text-xs text-gray-500">
                        Nycklar kan sparas när chatten är kopplad till ett projekt.
                      </p>
                    ) : null}
                    {saveError && saveError.dossierId === entry.id ? (
                      <p className="text-xs text-rose-300">{saveError.message}</p>
                    ) : null}
                  </div>
                ) : null}
                {saveConfirmation && saveConfirmation.dossierId === entry.id ? (
                  <p className="mt-3 text-xs text-emerald-300">
                    Nyckeln sparad. Previewn startas om. Blocket blir live när
                    integrationen är byggd; är den redan byggd räcker en riktig nyckel.
                  </p>
                ) : null}
              </div>
            ) : null}
            {entry.dependencies.length > 0 ? (
              <p className="text-xs text-gray-500">
                npm: {entry.dependencies.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title={
            needsAttention
              ? "Ett byggblock kör demo eller väntar på en nyckel — öppna Byggblock"
              : "Visa byggblock på sajten"
          }
          className={cn("relative text-gray-400 hover:text-white", className)}
        >
          <Boxes aria-hidden="true" className="mr-1 h-4 w-4" />
          Byggblock
          {count !== null && count > 0 ? (
            <Badge
              variant="outline"
              className="ml-1.5 border-gray-600/50 bg-gray-500/10 text-[10px] text-gray-200"
            >
              {count}
            </Badge>
          ) : null}
          {needsAttention ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-gray-950"
              aria-label="Åtgärd krävs: en integration är blockerad eller kör i demo-läge"
            />
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full gap-0 border-gray-800 bg-gray-950 p-0 text-gray-200 sm:max-w-xl"
      >
        <SheetHeader className="space-y-1 border-b border-gray-800 px-4 py-3 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base text-white">
            Byggblock
            {loading && freshData ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-gray-400" />
            ) : null}
          </SheetTitle>
          <SheetDescription className="min-w-0 truncate text-xs text-gray-500">
            {headerMeta}
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as PanelTab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsList
            variant="line"
            className="mx-4 mt-3 h-8 w-auto gap-2 border-b border-gray-800 bg-transparent p-0"
          >
            <TabsTrigger
              value="wired"
              className="rounded-none border-0 px-2 py-1.5 text-xs text-gray-400 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-white"
            >
              På sajten{freshData ? ` (${freshData.counts.total})` : ""}
            </TabsTrigger>
            <TabsTrigger
              value="catalog"
              className="rounded-none border-0 px-2 py-1.5 text-xs text-gray-400 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-white"
            >
              Fler byggblock{catalogData ? ` (${catalogCounts.total})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wired" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
            {loading && !freshData ? (
              <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Läser byggblock-status…
              </div>
            ) : error ? (
              <p className="py-4 text-xs text-rose-300">{error}</p>
            ) : freshData && freshData.dossiers.length === 0 ? (
              <p className="py-4 text-xs text-gray-400">
                Inga byggblock används i den här versionen.
              </p>
            ) : (
              <div className="space-y-5">
                {groupedDossiers.map(({ group, rows }) => (
                  <div key={group.id} className="space-y-2">
                    <p
                      className="px-0.5 text-xs font-medium tracking-wide text-gray-500 uppercase"
                      title={GROUP_HEADING_TITLE}
                    >
                      {group.label}
                    </p>
                    <ul className="space-y-2">{rows.map(renderRow)}</ul>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 space-y-3 border-t border-gray-800 pt-4">
              <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                Egna nycklar
              </p>
              {customFocusKeys.length > 0 ? (
                <ul className="space-y-3">
                  {customFocusKeys.map((key) => (
                    <li key={key} className="space-y-1.5">
                      <code className="rounded-md bg-gray-800/60 px-1.5 py-0.5 text-[11px] text-gray-200">
                        {key}
                      </code>
                      <span className="flex items-center gap-2">
                        <KeyRound className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                        <Input
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          aria-label={`Värde för ${key}`}
                          value={keyValues[key] ?? ""}
                          disabled={!projectId || customSaving}
                          onChange={(event) =>
                            setKeyValues((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          placeholder={projectId ? "Klistra in riktigt värde" : "Projekt saknas"}
                          className="h-8 border-gray-700 bg-black/30 text-xs"
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500">
                  Nycklar som koden använder men inget byggblock äger hamnar här.
                </p>
              )}
              {customFocusKeys.length > 0 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 px-3 text-xs"
                  disabled={
                    !projectId ||
                    customSaving ||
                    !customFocusKeys.some((key) => (keyValues[key] ?? "").trim().length > 0)
                  }
                  onClick={() => void handleSaveCustomKeys()}
                >
                  {customSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Spara nyckel
                </Button>
              ) : null}
              {customError ? (
                <p className="text-xs text-rose-300">{customError}</p>
              ) : null}
              {customSaveConfirmation && !customError ? (
                <p className="text-xs text-emerald-300">
                  Sparat. Previewn startas om med de nya värdena.
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Namn på egen env-nyckel"
                  value={customKeyDraft}
                  disabled={!projectId}
                  onChange={(event) => setCustomKeyDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddCustomKey();
                    }
                  }}
                  placeholder="MY_API_KEY"
                  className="h-8 border-gray-700 bg-black/30 font-mono text-xs uppercase"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-3 text-xs"
                  disabled={!projectId || customKeyDraft.trim().length === 0}
                  onClick={handleAddCustomKey}
                >
                  Lägg till
                </Button>
              </div>
              {customKeyDraftError ? (
                <p className="text-xs text-rose-300">{customKeyDraftError}</p>
              ) : null}
              {!projectId ? (
                <p className="text-xs text-gray-500">
                  Nycklar kan sparas när chatten är kopplad till ett projekt.
                </p>
              ) : null}
            </div>

            {freshData && !freshData.versionFilesAvailable ? (
              <p className="mt-4 border-t border-gray-800 pt-3 text-xs text-gray-500">
                Byggstatus kunde inte läsas (versionens filer saknas) — kopplade
                byggblock visas som ej byggda tills filerna finns.
              </p>
            ) : null}
          </TabsContent>

          <TabsContent value="catalog" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            {catalogPickDisabled && !pickedEntry ? (
              <p className="border-b border-gray-800 bg-sky-500/6 px-4 py-2.5 text-xs text-sky-200">
                Vänta tills pågående generering är klar innan du lägger till ett
                byggblock.
              </p>
            ) : null}
            {pickedEntry ? (
              <DossierCatalogStagingView
                key={pickedEntry.id}
                entry={pickedEntry}
                stage={stage}
                confirmed={stagingConfirmed}
                catalogPickDisabled={catalogPickDisabled}
                projectId={projectId}
                keyValues={keyValues}
                setKeyValues={setKeyValues}
                saving={savingDossierId === pickedEntry.id}
                saveError={
                  saveError && saveError.dossierId === pickedEntry.id
                    ? saveError.message
                    : null
                }
                saveConfirmation={saveConfirmation?.dossierId === pickedEntry.id}
                onSaveKeys={() => void handleSaveStagedKeys()}
                onConfirm={handleConfirmStagedDossier}
                onCancel={handleCancelStagedDossier}
              />
            ) : (
              <div className="p-4">
                {catalogData && catalogData.groups.length > 0 ? (
                  <div
                    role="group"
                    aria-label="Filtrera katalogen"
                    className="mb-3 flex flex-wrap items-center gap-1.5"
                  >
                    <Button
                      type="button"
                      size="xs"
                      variant={catalogClassFilter === "all" ? "secondary" : "ghost"}
                      className="h-7 px-2.5 text-xs"
                      aria-pressed={catalogClassFilter === "all"}
                      onClick={() => setCatalogClassFilter("all")}
                    >
                      Alla ({catalogCounts.total})
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant={catalogClassFilter === "hard" ? "secondary" : "ghost"}
                      className="h-7 px-2.5 text-xs"
                      aria-pressed={catalogClassFilter === "hard"}
                      onClick={() => setCatalogClassFilter("hard")}
                    >
                      {describeDossierClass("hard").label} ({catalogCounts.hard})
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant={catalogClassFilter === "soft" ? "secondary" : "ghost"}
                      className="h-7 px-2.5 text-xs"
                      aria-pressed={catalogClassFilter === "soft"}
                      onClick={() => setCatalogClassFilter("soft")}
                    >
                      {describeDossierClass("soft").label} ({catalogCounts.soft})
                    </Button>
                  </div>
                ) : null}
                {catalogLoading && !catalogData ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Läser katalogen…
                  </div>
                ) : catalogError ? (
                  <div className="space-y-2 py-4">
                    <p className="text-xs text-rose-300">{catalogError}</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={() => void loadCatalog()}
                    >
                      Försök igen
                    </Button>
                  </div>
                ) : catalogData && catalogData.groups.length === 0 ? (
                  <p className="py-4 text-xs text-gray-400">Katalogen är tom.</p>
                ) : catalogData && filteredCatalogGroups.length === 0 ? (
                  <p className="py-4 text-xs text-gray-400">
                    Inga {catalogClassFilter === "hard" ? "externa" : "fristående"} byggblock i
                    katalogen.
                  </p>
                ) : (
                  <div className="space-y-5">
                    {filteredCatalogGroups.map((group) => (
                      <div key={group.id} className="space-y-2">
                        <p
                          className="px-0.5 text-xs font-medium tracking-wide text-gray-500 uppercase"
                          title={GROUP_HEADING_TITLE}
                        >
                          {group.label}
                        </p>
                        <ul className="space-y-2">
                          {group.dossiers.map((entry) => {
                            const pickBlocked =
                              !onRequestDossier || catalogPickDisabled || pickedEntry !== null;
                            return (
                              <li key={entry.id}>
                                <button
                                  type="button"
                                  onClick={() => handleSelectCatalogDossier(entry)}
                                  disabled={pickBlocked}
                                  title={
                                    !onRequestDossier
                                      ? undefined
                                      : catalogPickDisabled
                                        ? "Vänta tills pågående generering är klar"
                                        : pickedEntry !== null
                                          ? "Ett byggblock är redan valt — avbryt för att välja ett annat"
                                          : `Välj byggblocket ${entry.label}`
                                  }
                                  className="flex w-full items-start gap-3 rounded-lg border border-gray-800 bg-black/20 px-3 py-3 text-left hover:bg-gray-800/40 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-1.5">
                                      <span className="truncate text-sm font-medium text-gray-100">
                                        {entry.label}
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "shrink-0 text-[10px]",
                                          entry.class === "hard"
                                            ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                                            : "border-gray-600/50 bg-gray-500/10 text-gray-300",
                                        )}
                                        title={describeDossierClass(entry.class).hint}
                                      >
                                        {describeDossierClass(entry.class).label}
                                      </Badge>
                                      {entry.requiresF3 ? <RequiresF3Badge /> : null}
                                    </span>
                                    <span className="mt-1 block text-xs leading-relaxed text-gray-500">
                                      {entry.summarySv ?? entry.summary}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
