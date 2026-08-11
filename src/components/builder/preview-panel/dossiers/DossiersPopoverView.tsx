"use client";

import { Boxes, ChevronRight, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  describeDossierStatus,
  describeEnvKeyValueState,
  type DossierOverviewEntry,
} from "@/lib/builder/dossier-overview";
import {
  describeDossierClass,
  describeDossierMockMode,
} from "@/lib/builder/dossier-axes";
import { resolveDossierGroup } from "@/lib/builder/dossier-groups";
import { cn } from "@/lib/utils";
import type { usePreviewPanelDossiersController } from "../hooks/usePreviewPanelDossiersController";
import {
  describeActiveVersionLabel,
  ENFORCEMENT_LABEL,
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

export function DossiersPopoverView({
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
    handleOpenChange,
    handleSelectCatalogDossier,
    needsAttention,
    groupedDossiers,
    catalogClassFilter,
    setCatalogClassFilter,
    catalogCounts,
    filteredCatalogGroups,
  } = vm;

  const activeVersionLabel = describeActiveVersionLabel(activeVersionMeta, versionId);

  const renderRow = (entry: DossierOverviewEntry) => {
    const descriptor = describeDossierStatus(entry.status, stage, entry.class);
    const classDescriptor = describeDossierClass(entry.class);
    const mockDescriptor = describeDossierMockMode(entry.mock);
    const isExpanded = expandedId === entry.id;
    return (
      <li key={entry.id} className="rounded-md border border-gray-800 bg-black/20">
        <button
          type="button"
          onClick={() => setExpandedId(isExpanded ? null : entry.id)}
          aria-expanded={isExpanded}
          className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-gray-800/40"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform",
              isExpanded && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-gray-100">
              {entry.label}
            </span>
            {/* Svensk gruppetikett i stället för rå capability-slug (t.ex.
                "payments") — samma presentationskarta som grupprubrikerna. */}
            <span className="block truncate text-[10px] text-gray-500">
              {resolveDossierGroup(entry.capability).label}
            </span>
          </span>
          {/* Tre oberoende axlar, i den ordning de betyder något för
              användaren: behöver den nycklar → byggs den i F3 → var i flödet
              står den nu. Ingen av dem kan härledas ur någon annan. */}
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 text-[9px]",
              entry.class === "hard"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border-gray-600/50 bg-gray-500/10 text-gray-300",
            )}
            title={classDescriptor.hint}
          >
            {classDescriptor.label}
          </Badge>
          {entry.requiresF3 ? <RequiresF3Badge /> : null}
          <Badge
            variant="outline"
            className={cn("text-[10px]", TONE_BADGE_CLASS[descriptor.tone])}
            title={descriptor.hint}
          >
            {descriptor.label}
          </Badge>
        </button>
        {isExpanded ? (
          <div className="space-y-2 border-t border-gray-800 px-2.5 py-2 text-[11px] text-gray-300">
            <p className="text-gray-400">{entry.summarySv ?? entry.summary}</p>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-gray-500">
              <span className="rounded bg-gray-800/60 px-1.5 py-0.5" title={classDescriptor.hint}>
                {entry.class === "hard"
                  ? "Kopplad (kräver extern tjänst/nycklar)"
                  : "Fristående (inga nycklar behövs)"}
              </span>
              {/* Demoläget är den enda av de tre axlarna som säger vad
                  besökaren faktiskt ser innan nycklarna finns. */}
              {entry.class === "hard" ? (
                <span className="rounded bg-gray-800/60 px-1.5 py-0.5" title={mockDescriptor.hint}>
                  Demoläge: {mockDescriptor.label}
                </span>
              ) : null}
              <span className="rounded bg-gray-800/60 px-1.5 py-0.5">
                Komplexitet: {entry.complexity}
              </span>
            </div>
            {entry.status === "blocked-build" && entry.missingKeys.length > 0 ? (
              <p className="text-amber-300">
                Blockerar &quot;Bygg integrationer&quot;: {entry.missingKeys.join(", ")}
              </p>
            ) : null}
            {entry.status === "built-demo" && entry.missingLiveKeys.length > 0 ? (
              <p className="text-amber-300">
                Demo-läge — lägg till för livefunktion: {entry.missingLiveKeys.join(", ")}
              </p>
            ) : null}
            {entry.envVars.length > 0 ? (
              <div>
                <p className="mb-1 font-medium text-gray-400">Env-nycklar</p>
                <ul className="space-y-2">
                  {entry.envVars.map((env) => {
                    const valueState = describeEnvKeyValueState(env);
                    return (
                      <li key={env.key} className="space-y-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <code className="rounded bg-gray-800/60 px-1 py-0.5 text-[10px] text-gray-200">
                            {env.key}
                          </code>
                          <span className="text-[10px] text-gray-500">
                            {ENFORCEMENT_LABEL[env.enforcement]}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn("text-[9px]", TONE_BADGE_CLASS[valueState.tone])}
                            title={valueState.hint}
                          >
                            {valueState.label}
                          </Badge>
                        </span>
                        <span className="flex items-start justify-between gap-2 text-[10px] text-gray-400">
                          <span>{env.purpose}</span>
                          {env.setupUrl ? (
                            <a
                              href={env.setupUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 text-sky-300 hover:text-sky-200"
                            >
                              Hämta värde
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </a>
                          ) : null}
                        </span>
                        {/* Write-only masked input for keys without a stored
                            real value — available in both F2 and F3 (owner
                            decision 2026-07-13). Saved values are never read
                            back; only `hasRealValue` flips. Configured keys
                            get an explicit "Ändra"-toggle instead (the F2
                            correction path — the full editor is F3-only). */}
                        {!env.hasRealValue || editingKeys.has(env.key) ? (
                          <span className="flex items-center gap-1.5">
                            <KeyRound className="h-3 w-3 shrink-0 text-gray-500" />
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
                              className="h-7 border-gray-700 bg-black/30 text-[11px]"
                            />
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setEditingKeys((current) => new Set(current).add(env.key))
                              }
                              className="text-[10px] text-sky-300 hover:text-sky-200"
                            >
                              Ändra värde
                            </button>
                            {/* Delete surface (P2 BB#envdel1): the removed
                                ProjectEnvVarsPanel was the only UI that could
                                DELETE a stored key — wrong/secret values must
                                stay removable from the builder. */}
                            <button
                              type="button"
                              disabled={!projectId || deletingKey !== null || savingDossierId !== null}
                              onClick={() => void handleDeleteKey(entry, env.key)}
                              className="text-[10px] text-rose-300 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
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
                  <div className="mt-2 space-y-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-6 px-2 text-[10px]"
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
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : null}
                      Spara och aktivera
                    </Button>
                    {!projectId ? (
                      <p className="text-[10px] text-gray-500">
                        Nycklar kan sparas när chatten är kopplad till ett projekt.
                      </p>
                    ) : null}
                    {saveError && saveError.dossierId === entry.id ? (
                      <p className="text-[10px] text-rose-300">{saveError.message}</p>
                    ) : null}
                  </div>
                ) : null}
                {/* Lucka 1 (ägarbeslut 2026-08-11): ersätter den borttagna
                    "Miljövariabler sparade"-toasten med ett kvitto precis där
                    nyckeln skrevs in — inklusive den previewn-startar om-info
                    som annars försvann med toasten. Ligger UTANFÖR
                    "still needs input"-blocket ovan: en lyckad sista nyckel
                    gör att det blocket försvinner (inget kvar att fylla i),
                    men kvittot ska ändå synas. */}
                {saveConfirmation && saveConfirmation.dossierId === entry.id ? (
                  <p className="mt-2 text-[10px] text-emerald-300">
                    Ifylld — byggblocket är nu &quot;{descriptor.label}&quot;. Previewn startas
                    om med det nya värdet.
                  </p>
                ) : null}
              </div>
            ) : null}
            {entry.dependencies.length > 0 ? (
              <p className="text-[10px] text-gray-500">
                npm: {entry.dependencies.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title={
            needsAttention
              ? "Byggblock: en integration är blockerad eller kör i demo-läge — klicka för att fylla i nycklar"
              : "Visa och konfigurera inkopplade byggblock"
          }
          className={cn("relative text-gray-400 hover:text-white", className)}
        >
          <Boxes className="mr-1 h-4 w-4" />
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
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 border-gray-800 bg-gray-950 p-0 text-gray-200"
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
            Byggblock
            {loading && freshData ? (
              <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
            ) : null}
          </span>
          {activeTab === "catalog" && catalogData ? (
            <span className="text-[10px] text-gray-500">
              Katalog: {catalogCounts.total} totalt · {catalogCounts.hard} kopplade ·{" "}
              {catalogCounts.soft} fristående
            </span>
          ) : activeTab === "catalog" && catalogLoading ? (
            <span className="text-[10px] text-gray-500">Katalog: läser…</span>
          ) : freshData && activeVersionLabel ? (
            // Lucka 2 (ägarbeslut 2026-08-11): ersätter "Version: N kopplade ·
            // M fristående" — den raden dubblerade fliken `Inkopplade (N)` och
            // katalogfiltren utan att säga VILKEN version statusen gäller.
            <span className="text-[10px] text-gray-500">{activeVersionLabel}</span>
          ) : null}
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as PanelTab)}
          className="w-full gap-0"
        >
          <TabsList
            variant="line"
            className="mx-3 mt-2 h-7 w-auto gap-1 border-b border-gray-800 bg-transparent p-0"
          >
            <TabsTrigger
              value="wired"
              className="rounded-none border-0 px-1.5 py-1 text-[11px] text-gray-400 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-white"
            >
              Inkopplade{freshData ? ` (${freshData.counts.total})` : ""}
            </TabsTrigger>
            <TabsTrigger
              value="catalog"
              className="rounded-none border-0 px-1.5 py-1 text-[11px] text-gray-400 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-white"
            >
              Bläddra katalog{catalogData ? ` (${catalogCounts.total})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wired" className="mt-0">
            <div className="max-h-105 overflow-y-auto p-2">
          {loading && !freshData ? (
            <div className="flex items-center gap-2 px-1 py-3 text-[11px] text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Läser byggblock-status…
            </div>
          ) : error ? (
            <p className="px-1 py-3 text-[11px] text-rose-300">{error}</p>
          ) : freshData && freshData.dossiers.length === 0 ? (
            <p className="px-1 py-3 text-[11px] text-gray-400">
              Inga byggblock är inkopplade i den här versionen.
            </p>
          ) : (
            <div className="space-y-3">
              {groupedDossiers.map(({ group, rows }) => (
                <div key={group.id} className="space-y-1.5">
                  <p
                    className="px-1 text-[10px] font-medium tracking-wide text-gray-500 uppercase"
                    title={GROUP_HEADING_TITLE}
                  >
                    {group.label}
                  </p>
                  <ul className="space-y-1.5">{rows.map(renderRow)}</ul>
                </div>
              ))}
            </div>
          )}

          {/* Egna nycklar (Codex P2 on #573): custom env-blockers ur genererad
              kod som inget byggblock äger + manuell "lägg till egen nyckel".
              Samma write-only-kontrakt och POST-API som dossier-raderna. */}
          <div className="mt-3 space-y-2 border-t border-gray-800 px-1 pt-2">
            <p className="text-[10px] font-medium tracking-wide text-gray-500 uppercase">
              Egna nycklar
            </p>
            {customFocusKeys.length > 0 ? (
              <ul className="space-y-2">
                {customFocusKeys.map((key) => (
                  <li key={key} className="space-y-1">
                    <code className="rounded bg-gray-800/60 px-1 py-0.5 text-[10px] text-gray-200">
                      {key}
                    </code>
                    <span className="flex items-center gap-1.5">
                      <KeyRound className="h-3 w-3 shrink-0 text-gray-500" />
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
                        className="h-7 border-gray-700 bg-black/30 text-[11px]"
                      />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-gray-500">
                Nycklar som koden använder men inget byggblock äger hamnar här.
              </p>
            )}
            {customFocusKeys.length > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 px-2 text-[10px]"
                disabled={
                  !projectId ||
                  customSaving ||
                  !customFocusKeys.some((key) => (keyValues[key] ?? "").trim().length > 0)
                }
                onClick={() => void handleSaveCustomKeys()}
              >
                {customSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Spara och aktivera
              </Button>
            ) : null}
            {customError ? (
              <p className="text-[10px] text-rose-300">{customError}</p>
            ) : null}
            {customSaveConfirmation && !customError ? (
              <p className="text-[10px] text-emerald-300">
                Sparat. Previewn startas om med de nya värdena.
              </p>
            ) : null}
            <div className="flex items-center gap-1.5">
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
                className="h-7 border-gray-700 bg-black/30 font-mono text-[11px] uppercase"
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[10px]"
                disabled={!projectId || customKeyDraft.trim().length === 0}
                onClick={handleAddCustomKey}
              >
                Lägg till
              </Button>
            </div>
            {customKeyDraftError ? (
              <p className="text-[10px] text-rose-300">{customKeyDraftError}</p>
            ) : null}
            {!projectId ? (
              <p className="text-[10px] text-gray-500">
                Nycklar kan sparas när chatten är kopplad till ett projekt.
              </p>
            ) : null}
          </div>

          {freshData && !freshData.versionFilesAvailable ? (
            <p className="mt-2 border-t border-gray-800 px-1 pt-2 text-[10px] text-gray-500">
              Byggstatus kunde inte läsas (versionens filer saknas) — kopplade
              byggblock visas som ej byggda tills filerna finns.
            </p>
          ) : null}
            </div>
          </TabsContent>

          <TabsContent value="catalog" className="mt-0">
            {catalogPickDisabled ? (
              <p className="border-b border-gray-800 bg-sky-500/6 px-3 py-2 text-[10px] text-sky-200">
                Vänta tills pågående generering är klar innan du lägger till ett
                byggblock.
              </p>
            ) : null}
            {pickedEntry ? (
              <p
                className="border-b border-gray-800 bg-sky-500/6 px-3 py-2 text-[10px] text-sky-200"
                aria-live="polite"
              >
                Byggblocket &quot;{pickedEntry.label}&quot; läggs till via chatten.
                {pickedEntry.class === "hard"
                  ? " Kopplade byggblock ritas bara som yta i designläget och kopplas in på riktigt vid \u201dBygg integrationer\u201d."
                  : null}
              </p>
            ) : null}
            <div className="max-h-105 overflow-y-auto p-2">
              {catalogData && catalogData.groups.length > 0 ? (
                <div
                  role="group"
                  aria-label="Filtrera katalogen"
                  className="mb-2 flex items-center gap-1"
                >
                  <Button
                    type="button"
                    size="xs"
                    variant={catalogClassFilter === "all" ? "secondary" : "ghost"}
                    className="h-6 px-2 text-[10px]"
                    aria-pressed={catalogClassFilter === "all"}
                    onClick={() => setCatalogClassFilter("all")}
                  >
                    Alla ({catalogCounts.total})
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={catalogClassFilter === "hard" ? "secondary" : "ghost"}
                    className="h-6 px-2 text-[10px]"
                    aria-pressed={catalogClassFilter === "hard"}
                    onClick={() => setCatalogClassFilter("hard")}
                  >
                    Kopplade ({catalogCounts.hard})
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={catalogClassFilter === "soft" ? "secondary" : "ghost"}
                    className="h-6 px-2 text-[10px]"
                    aria-pressed={catalogClassFilter === "soft"}
                    onClick={() => setCatalogClassFilter("soft")}
                  >
                    Fristående ({catalogCounts.soft})
                  </Button>
                </div>
              ) : null}
              {catalogLoading && !catalogData ? (
                <div className="flex items-center gap-2 px-1 py-3 text-[11px] text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Läser katalogen…
                </div>
              ) : catalogError ? (
                <div className="space-y-2 px-1 py-3">
                  <p className="text-[11px] text-rose-300">{catalogError}</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => void loadCatalog()}
                  >
                    Försök igen
                  </Button>
                </div>
              ) : catalogData && catalogData.groups.length === 0 ? (
                <p className="px-1 py-3 text-[11px] text-gray-400">Katalogen är tom.</p>
              ) : catalogData && filteredCatalogGroups.length === 0 ? (
                <p className="px-1 py-3 text-[11px] text-gray-400">
                  Inga {catalogClassFilter === "hard" ? "kopplade" : "fristående"} byggblock i
                  katalogen.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredCatalogGroups.map((group) => (
                    <div key={group.id} className="space-y-1.5">
                      <p
                        className="px-1 text-[10px] font-medium tracking-wide text-gray-500 uppercase"
                        title={GROUP_HEADING_TITLE}
                      >
                        {group.label}
                      </p>
                      <ul className="space-y-1.5">
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
                                        ? "Ett byggblock har redan valts — stäng panelen för att välja igen"
                                        : `Lägg till byggblocket ${entry.label}`
                                }
                                className="flex w-full items-start gap-2 rounded-md border border-gray-800 bg-black/20 px-2.5 py-2 text-left hover:bg-gray-800/40 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    <span className="truncate text-[12px] font-medium text-gray-100">
                                      {entry.label}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "shrink-0 text-[9px]",
                                        entry.class === "hard"
                                          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                                          : "border-gray-600/50 bg-gray-500/10 text-gray-300",
                                      )}
                                      title={describeDossierClass(entry.class).hint}
                                    >
                                      {describeDossierClass(entry.class).label}
                                    </Badge>
                                    {/* Kräver F3 måste synas FÖRE valet — det
                                        är den axeln som avgör när användaren
                                        får den riktiga funktionen. */}
                                    {entry.requiresF3 ? <RequiresF3Badge /> : null}
                                  </span>
                                  <span className="mt-0.5 block truncate text-[10px] text-gray-500">
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
          </TabsContent>
        </Tabs>

        {/* Ägarbeslut 2026-07-22: den separata env-panelen är borttagen —
            Byggblock-popovern är den enda env-ytan i både F2 och F3. */}
      </PopoverContent>
    </Popover>
  );
}
