import {
  F3_REQUIREMENTS_EVENT,
  F3_STATUS_EVENT,
  openDossiersPanel,
  PROJECT_ENV_VARS_UPDATED_EVENT,
  readF3RequirementsDetail,
  readF3StatusDetail,
  readProjectEnvVarsUpdatedDetail,
  resolveF3StatusTitle,
  subtractSavedKeysFromF3Requirements,
} from "@/lib/builder/project-env-events";
import type { F3BuilderStatus, F3MissingIntegration } from "@/lib/builder/f3-status";
import type { DossierOverviewResponse } from "@/lib/builder/dossier-overview";
import { buildPromptSourceMessage } from "@/lib/builder/prompt-builder";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { BuilderViewModel } from "../useBuilderPageController";

export type F3Requirements = {
  parentVersionId: string;
  projectId?: string | null;
  requestStartedAt?: number;
  missingByIntegration: F3MissingIntegration[];
};

/**
 * State som bär sin egen scope. F3-krav, F3-status och sparade env-nycklar
 * hör till EN chatt (och kravet till EN version). I stället för effekter som
 * nollställer state när chatt/version byter — det mönster React Compiler-linten
 * (`set-state-in-effect`) flaggar, och som dessutom landar en commit för sent —
 * taggas värdet med scopen när det skrivs och filtreras vid läsning. Samma
 * modell som `dossierCountsState` nedan.
 */
type Scoped<T> = { chatId: string | null; value: T; receivedAt: number };

const EMPTY_KEYS: ReadonlyMap<string, number> = new Map();

/**
 * F3-krav/status, mobilflik och övrig chrome för builderskalet. (Tips-
 * popovern som bodde här togs bort 2026-10-22: Sajtagenten kommenterar i
 * stället i chatten efter varje bygge — `SajtagentProvider`.)
 */
export function useShellF3TipsChrome(vm: BuilderViewModel, sendMessage: BuilderViewModel["sendMessage"]) {
  const chatId = vm.chatId;
  const [requirementsState, setRequirementsState] = useState<Scoped<F3Requirements> | null>(null);
  const [statusState, setStatusState] = useState<Scoped<F3BuilderStatus> | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");

  // Samma yttre kontrakt som en vanlig setState: callers (`use-preview-layout`,
  // previewverktygen) skickar värde eller uppdaterare. Scopen (chatten) sätts
  // här, så ett sent event från en annan chatt aldrig kan skriva in sig som
  // aktuellt — och `receivedAt` ger prune-gränsen för sparade nycklar nedan.
  const setF3Requirements = useCallback<Dispatch<SetStateAction<F3Requirements | null>>>(
    (action) => {
      setRequirementsState((prev) => {
        const prevValue = prev && prev.chatId === chatId ? prev.value : null;
        const next = typeof action === "function" ? action(prevValue) : action;
        if (!next) return null;
        if (prev && prev.chatId === chatId && prev.value === next) return prev;
        return { chatId, value: next, receivedAt: Date.now() };
      });
    },
    [chatId],
  );
  const setF3Status = useCallback<Dispatch<SetStateAction<F3BuilderStatus | null>>>(
    (action) => {
      setStatusState((prev) => {
        const prevValue = prev && prev.chatId === chatId ? prev.value : null;
        const next = typeof action === "function" ? action(prevValue) : action;
        if (!next) return null;
        if (prev && prev.chatId === chatId && prev.value === next) return prev;
        return { chatId, value: next, receivedAt: Date.now() };
      });
    },
    [chatId],
  );

  // A 412 payload belongs to the exact F2 version the user tried to finalize:
  // it is visible only while that base is the active version (and the chat is
  // the one it arrived in). Switching to another version hides it; switching
  // back shows it again, since nothing about the verdict changed.
  const f3Requirements =
    requirementsState &&
    requirementsState.chatId === chatId &&
    (!vm.activeVersionId || requirementsState.value.parentVersionId === vm.activeVersionId)
      ? requirementsState.value
      : null;
  const f3Status = statusState && statusState.chatId === chatId ? statusState.value : null;

  // Lucka 3 (ägarbeslut 2026-08-11): Byggblock-panelen (PreviewPanelDossiers)
  // rapporterar sina counts hit via `onCountsChange` — samma data F3-triggerns
  // framgångstitel behöver, utan att triggern hämtar `/dossiers` själv (se
  // noten i 05-builder-statussanning.md).
  //
  // Counts are stored WITH the chat/version scope they were reported under.
  // At read time we only trust them when that scope still matches the live
  // `activeVersionId` (Bugbot on this diff): a `useEffect` reset would clear
  // one paint too late, so `resolveF3StatusTitle` below could briefly weave
  // the PREVIOUS version's live/demo numbers into the new version's success
  // title. Scoping at read time also covers the unmount case where
  // `PreviewPanelDossiers` (the only `onCountsChange` source) is gone between
  // versions (`BuilderPreviewTools` returns null when there's no preview
  // surface yet) and nothing would call back to clear us.
  const countsScopeKey = `${vm.chatId ?? ""}::${vm.activeVersionId ?? ""}`;
  const [dossierCountsState, setDossierCountsState] = useState<{
    scope: string;
    counts: DossierOverviewResponse["counts"] | null;
  } | null>(null);
  const handleDossierCountsChange = useCallback(
    (counts: DossierOverviewResponse["counts"] | null) => {
      setDossierCountsState({ scope: countsScopeKey, counts });
    },
    [countsScopeKey],
  );
  const dossierCounts =
    dossierCountsState && dossierCountsState.scope === countsScopeKey
      ? dossierCountsState.counts
      : null;

  // (Prompt-prefill-lyssnaren togs bort 2026-07-31: Byggval-reglagen skriver
  // inte längre i chattens input, och exempel-chipsen försvann med #673.)
  const [githubExportOpen, setGithubExportOpen] = useState(false);
  const [enableAutofix, setEnableAutofix] = useState(true);
  const [isFigmaInputOpen, setIsFigmaInputOpen] = useState(false);
  const handleApproveBuildPlan = useCallback(
    async (plan: Record<string, unknown>) => {
      const built = buildPromptSourceMessage({ kind: "approved-plan", rawPlan: plan });
      await sendMessage(built.message, { promptSourceMeta: built.meta });
    },
    [sendMessage],
  );

  // A verdict describes one version, so it must not linger over another one
  // the user selected afterwards — its "Visa diagnostik" link would then open
  // a different version's log (bugbot on #639). Outcomes with no version of
  // their own (e.g. "no version yet") are kept until the chat changes. Gated
  // at render time: a verdict for a version that is activated a moment later
  // (the fresh-build lane from #639) becomes visible as soon as
  // `vm.activeVersionId` catches up.
  const scopedF3Status =
    f3Status?.versionId && vm.activeVersionId && f3Status.versionId !== vm.activeVersionId
      ? null
      : f3Status;
  // `usesLiveDossierCounts` (Bugbot, 5th pass on this diff): the F3 success
  // title cannot be computed correctly at report time — the only counts
  // `PreviewPanelF3Trigger` can reach describe the OLD parent version, never
  // the version this status is about. `resolveF3StatusTitle` re-derives it
  // from `dossierCounts` instead: the guard above already guarantees
  // `scopedF3Status.versionId` (when set) equals `vm.activeVersionId`, and
  // `dossierCounts` is null whenever the stored counts were reported under a
  // DIFFERENT chat/version scope (see the scoped `dossierCountsState` above —
  // a useEffect reset would be one paint too late) and only ever non-null
  // after a fetch scoped to THAT same `vm.activeVersionId` (see
  // `PreviewPanelDossiers`'s own `dataKey`/`overviewKey` guard). Recomputing
  // at render time (not once, at report time) means the title self-corrects
  // as soon as the fresh fetch resolves, with no new fetch of its own.
  const visibleF3Status = scopedF3Status
    ? resolveF3StatusTitle(scopedF3Status, dossierCounts)
    : null;

  useEffect(() => {
    const handleRequirements = (event: Event) => {
      const detail = readF3RequirementsDetail(event);
      if (!detail) return;
      // Chat correlation (Bugbot on this diff): a late 412 from a PREVIOUS
      // chat's stream must not surface another project's missing keys here.
      if (detail.chatId && detail.chatId !== chatId) return;
      setF3Requirements(detail);
      setF3Status(null);
      // Owner decision 2026-07-13: a 412 also focuses the affected dossier in
      // the Byggblock popover (pure UI action — the server's
      // missingByIntegration stays the source of truth for the key scope).
      openDossiersPanel(detail.missingByIntegration.flatMap((entry) => entry.missing));
    };
    window.addEventListener(F3_REQUIREMENTS_EVENT, handleRequirements);
    return () =>
      window.removeEventListener(F3_REQUIREMENTS_EVENT, handleRequirements);
  }, [chatId, setF3Requirements, setF3Status]);

  // The chat-stream lane runs its own nested finalize (409
  // `f3_deterministic_release_required`) and has no `onStatus` callback, so its
  // ReleaseGate verdict arrives as an event. Without this the row — and its
  // diagnostics link — only ever appeared for the preview-button lane (bugbot
  // on #639).
  useEffect(() => {
    const handleStatus = (event: Event) => {
      const detail = readF3StatusDetail(event);
      if (!detail) return;
      if (detail.chatId && detail.chatId !== chatId) return;
      setF3Status({
        tone: detail.tone,
        title: detail.title,
        description: detail.description,
        versionId: detail.versionId ?? null,
      });
    };
    window.addEventListener(F3_STATUS_EVENT, handleStatus);
    return () => window.removeEventListener(F3_STATUS_EVENT, handleStatus);
  }, [chatId, setF3Status]);

  // Keys saved anywhere (Byggblock inline inputs, kravytan, env-panelen)
  // reconcile the DISPLAYED 412 payload. The server's original key scope in
  // `f3Requirements` is never mutated — saves accumulate (timestamped) per chat
  // and the visible surface is derived by subtraction. A delete removes the
  // key again, so the requirement honestly reappears (Codex P2 + Bugbot
  // follow-ups on #525). Server-verdict precedence: saves made BEFORE the
  // current 412's request started are ignored — the server already saw them
  // and still says the key is missing — while saves made DURING the in-flight
  // request are kept. A verdict without `requestStartedAt` supersedes
  // everything saved before it landed (`receivedAt`).
  const [savedKeysState, setSavedKeysState] = useState<{
    chatId: string | null;
    keys: Map<string, number>;
  } | null>(null);
  useEffect(() => {
    const handleEnvUpdated = (event: Event) => {
      const detail = readProjectEnvVarsUpdatedDetail(event);
      if (!detail || !detail.envKeys || detail.envKeys.length === 0) return;
      if (detail.chatId && detail.chatId !== chatId) return;
      const keys = detail.envKeys.map((key) => key.trim().toUpperCase());
      const now = Date.now();
      setSavedKeysState((current) => {
        const next = new Map(current && current.chatId === chatId ? current.keys : []);
        for (const key of keys) {
          if (detail.action === "deleted") next.delete(key);
          else next.set(key, now);
        }
        return { chatId, keys: next };
      });
      // Deleting a key OUTSIDE the 412's missing-scope (Codex P1 on #525):
      // that key may have been the reason its integration was satisfied at
      // verdict time, and the client cannot re-add keys to a server-owned
      // scope — the whole verdict is stale. Drop the surface; the next
      // "Bygg integrationer" attempt fetches a fresh 412 with the correct
      // scope (the server gate itself was never bypassable, #517).
      if (detail.action === "deleted") {
        setF3Requirements((current) => {
          if (!current) return current;
          const scope = new Set(
            current.missingByIntegration.flatMap((entry) =>
              entry.missing.map((key) => key.trim().toUpperCase()),
            ),
          );
          const deletedOutsideScope = keys.some((key) => !scope.has(key));
          return deletedOutsideScope ? null : current;
        });
      }
    };
    window.addEventListener(PROJECT_ENV_VARS_UPDATED_EVENT, handleEnvUpdated);
    return () =>
      window.removeEventListener(PROJECT_ENV_VARS_UPDATED_EVENT, handleEnvUpdated);
  }, [chatId, setF3Requirements]);

  const savedKeys =
    savedKeysState && savedKeysState.chatId === chatId ? savedKeysState.keys : EMPTY_KEYS;
  const savedKeysCutoff =
    requirementsState && requirementsState.chatId === chatId
      ? (requirementsState.value.requestStartedAt ?? requirementsState.receivedAt)
      : Number.NEGATIVE_INFINITY;
  const visibleF3Requirements = useMemo(() => {
    const applicable: string[] = [];
    for (const [key, savedAt] of savedKeys) {
      if (savedAt >= savedKeysCutoff) applicable.push(key);
    }
    return subtractSavedKeysFromF3Requirements(f3Requirements, applicable);
  }, [f3Requirements, savedKeys, savedKeysCutoff]);

  return {
    f3Requirements,
    setF3Requirements,
    f3Status,
    setF3Status,
    visibleF3Status,
    visibleF3Requirements,
    handleDossierCountsChange,
    mobileTab,
    setMobileTab,
    githubExportOpen,
    setGithubExportOpen,
    enableAutofix,
    setEnableAutofix,
    isFigmaInputOpen,
    setIsFigmaInputOpen,
    handleApproveBuildPlan,
  };
}
