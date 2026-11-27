"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import {
  FIRST_BUILD_STEPS,
  FOLLOW_UP_STEPS,
  applyFollowUp,
  createInitialVersion,
  visibleSections,
  type BuildStep,
  type SectionId,
  type SiteVersion,
  type ThemeKey,
} from "./mock-data";
import type { StudioEngine } from "./engine";

export type Device = "desktop" | "tablet" | "mobile";
export type CanvasView = "preview" | "code";
export type ComposerMode = "auto" | "ask" | "build";
export type SiteType = "auto" | "site" | "app";

export type ChatMessage =
  | {
      id: string;
      role: "user";
      text: string;
      target: SectionId | null;
      /** «queued»: väntar på pågående bygge. «dropped»: bygget avbröts innan det skickades. */
      status?: "queued" | "dropped";
    }
  | { id: string; role: "build"; versionId: string; first: boolean; cancelled?: boolean }
  | { id: string; role: "assistant"; text: string; versionId: string | null; changed: SectionId[] };

export type PendingBuild = {
  version: SiteVersion;
  steps: BuildStep[];
  stepIndex: number;
  startedAt: number;
  first: boolean;
  target: SectionId | null;
};

export type StudioState = {
  projectName: string;
  messages: ChatMessage[];
  versions: SiteVersion[];
  activeVersionId: string | null;
  pending: PendingBuild | null;
  /** Antal sektioner som hunnit «materialiseras» under första bygget. */
  revealed: number;
  device: Device;
  view: CanvasView;
  inspect: boolean;
  selectedSection: SectionId | null;
  compare: boolean;
  preferredTheme: ThemeKey | "auto";
  siteType: SiteType;
  composerMode: ComposerMode;
  lastBuildMs: Record<string, number>;
  /** Senast byggda versionen, medan dess ändringar lyser upp i canvasen. */
  freshVersionId: string | null;
  /** Ändringar som skickats under ett bygge; körs i tur och ordning efteråt. */
  queue: { messageId: string; prompt: string; target: SectionId | null }[];
};

type Action =
  | { type: "submit"; prompt: string; target: SectionId | null; at: number }
  | { type: "advance"; at: number }
  | { type: "reveal" }
  | { type: "set"; patch: Partial<StudioState> }
  | { type: "selectVersion"; id: string }
  | { type: "cancel" }
  | { type: "reset" };

export const INITIAL_STUDIO_STATE: StudioState = {
  projectName: "Namnlöst projekt",
  messages: [],
  versions: [],
  activeVersionId: null,
  pending: null,
  revealed: 0,
  device: "desktop",
  view: "preview",
  inspect: false,
  selectedSection: null,
  compare: false,
  preferredTheme: "auto",
  siteType: "auto",
  composerMode: "auto",
  lastBuildMs: {},
  freshVersionId: null,
  queue: [],
};

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

const ASK_REPLY =
  "Bra fråga. I labbet svarar jag kort: börja med startbilden, den avgör om besökaren stannar. Vill du att jag gör ett förslag? Växla till Bygg eller skriv vad du vill ändra.";

/** Startar ett bygge från `base` (eller ett första bygge) och lägger byggkortet i chatten. */
function startBuild(
  state: StudioState,
  prompt: string,
  target: SectionId | null,
  at: number,
  base: SiteVersion | null,
): StudioState {
  const first = !base;
  const nextNumber = state.versions.reduce((max, v) => Math.max(max, v.number), 0) + 1;
  const version = base
    ? applyFollowUp(base, prompt, target, nextNumber)
    : createInitialVersion(prompt, state.preferredTheme);
  return {
    ...state,
    projectName: first ? version.content.brand : state.projectName,
    messages: [...state.messages, { id: nextId("m"), role: "build", versionId: version.id, first }],
    pending: {
      version,
      steps: first ? FIRST_BUILD_STEPS : FOLLOW_UP_STEPS,
      stepIndex: 0,
      startedAt: at,
      first,
      target,
    },
    revealed: first ? 0 : state.revealed,
    inspect: false,
    selectedSection: null,
    compare: false,
    view: "preview",
  };
}

export function studioReducer(state: StudioState, action: Action): StudioState {
  switch (action.type) {
    case "submit": {
      const active = state.versions.find((v) => v.id === state.activeVersionId) ?? null;
      const messageId = nextId("m");

      if (active && state.composerMode === "ask") {
        return {
          ...state,
          selectedSection: null,
          inspect: false,
          messages: [
            ...state.messages,
            { id: messageId, role: "user", text: action.prompt, target: action.target },
            { id: nextId("m"), role: "assistant", text: ASK_REPLY, versionId: null, changed: [] },
          ],
        };
      }

      // Under ett bygge: lägg ändringen i kö i stället för att spärra rutan.
      if (state.pending) {
        return {
          ...state,
          messages: [
            ...state.messages,
            {
              id: messageId,
              role: "user",
              text: action.prompt,
              target: action.target,
              status: "queued",
            },
          ],
          queue: [...state.queue, { messageId, prompt: action.prompt, target: action.target }],
        };
      }

      return startBuild(
        {
          ...state,
          messages: [
            ...state.messages,
            { id: messageId, role: "user", text: action.prompt, target: action.target },
          ],
        },
        action.prompt,
        action.target,
        action.at,
        active,
      );
    }
    case "advance": {
      const pending = state.pending;
      if (!pending) return state;
      const stepIndex = pending.stepIndex + 1;
      if (stepIndex < pending.steps.length) {
        return { ...state, pending: { ...pending, stepIndex } };
      }
      const { version } = pending;
      const finished: StudioState = {
        ...state,
        pending: null,
        revealed: visibleSections(version.content).length,
        versions: [...state.versions, version],
        activeVersionId: version.id,
        freshVersionId: pending.first ? null : version.id,
        lastBuildMs: { ...state.lastBuildMs, [version.id]: action.at - pending.startedAt },
        messages: [
          ...state.messages,
          {
            id: nextId("m"),
            role: "assistant",
            text: version.summary,
            versionId: version.id,
            changed: version.changed,
          },
        ],
      };
      const [next, ...rest] = state.queue;
      if (!next) return finished;
      // Nästa köade ändring startar direkt från versionen som just blev klar.
      return startBuild(
        {
          ...finished,
          queue: rest,
          messages: finished.messages.map((message) =>
            message.id === next.messageId && message.role === "user"
              ? { ...message, status: undefined }
              : message,
          ),
        },
        next.prompt,
        next.target,
        action.at,
        version,
      );
    }
    case "cancel": {
      if (!state.pending) return state;
      const dropped = new Set(state.queue.map((item) => item.messageId));
      const pendingId = state.pending.version.id;
      return {
        ...state,
        pending: null,
        queue: [],
        revealed: state.pending.first ? 0 : state.revealed,
        // Ett avbrutet första bygge lämnar inget namn efter sig.
        projectName: state.pending.first ? INITIAL_STUDIO_STATE.projectName : state.projectName,
        messages: [
          ...state.messages.map((message): ChatMessage => {
            if (dropped.has(message.id) && message.role === "user") {
              return { ...message, status: "dropped" };
            }
            if (message.role === "build" && message.versionId === pendingId && !message.cancelled) {
              return { ...message, cancelled: true };
            }
            return message;
          }),
          {
            id: nextId("m"),
            role: "assistant",
            text:
              dropped.size > 0
                ? "Bygget avbröts. Inget ändrades, och köade ändringar skickades inte."
                : "Bygget avbröts. Inget ändrades.",
            versionId: null,
            changed: [],
          },
        ],
      };
    }
    case "reveal":
      return { ...state, revealed: state.revealed + 1 };
    case "set":
      return { ...state, ...action.patch };
    case "selectVersion":
      if (state.pending) return state;
      return { ...state, activeVersionId: action.id, compare: false, selectedSection: null };
    case "reset":
      return INITIAL_STUDIO_STATE;
    default:
      return state;
  }
}

export function useStudio() {
  const [state, dispatch] = useReducer(studioReducer, INITIAL_STUDIO_STATE);
  const { pending } = state;

  // Stegen i ett pågående bygge går framåt på timer — en simulering av
  // byggmotorns faser.
  useEffect(() => {
    if (!pending) return;
    const step = pending.steps[pending.stepIndex];
    const timer = window.setTimeout(() => dispatch({ type: "advance", at: Date.now() }), step.ms);
    return () => window.clearTimeout(timer);
  }, [pending]);

  // Under första byggets «Bygger sektioner» materialiseras sektionerna en i taget.
  const isBuildStep = Boolean(pending?.first && pending.steps[pending.stepIndex]?.id === "build");
  const sectionCount = pending ? visibleSections(pending.version.content).length : 0;
  useEffect(() => {
    if (!isBuildStep || !pending) return;
    const buildStep = pending.steps[pending.stepIndex];
    const every = Math.max(240, Math.floor(buildStep.ms / (sectionCount + 1)));
    const timer = window.setInterval(() => dispatch({ type: "reveal" }), every);
    return () => window.clearInterval(timer);
  }, [isBuildStep, pending, sectionCount]);

  // Glöden runt ändrade sektioner visas en gång, direkt efter bygget.
  useEffect(() => {
    if (!state.freshVersionId) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "set", patch: { freshVersionId: null } }),
      2600,
    );
    return () => window.clearTimeout(timer);
  }, [state.freshVersionId]);

  const activeVersion = useMemo(
    () => state.versions.find((v) => v.id === state.activeVersionId) ?? null,
    [state.versions, state.activeVersionId],
  );
  // «Föregående» är versionen den byggdes från, inte bara numret före.
  const previousVersion = useMemo(() => {
    if (!activeVersion?.parentId) return null;
    return state.versions.find((v) => v.id === activeVersion.parentId) ?? null;
  }, [state.versions, activeVersion]);
  const latestVersion = state.versions.at(-1) ?? null;

  const submit = useCallback((prompt: string, target: SectionId | null = null) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    dispatch({ type: "submit", prompt: trimmed, target, at: Date.now() });
  }, []);
  const set = useCallback((patch: Partial<StudioState>) => dispatch({ type: "set", patch }), []);
  const selectVersion = useCallback((id: string) => dispatch({ type: "selectVersion", id }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const cancel = useCallback(() => dispatch({ type: "cancel" }), []);

  // Motorsidan av labbet i kontraktets form (se `engine.ts`). En adapter mot
  // den riktiga buildern ska ge exakt samma form.
  const engine = useMemo(
    () =>
      ({
        projectName: state.projectName,
        messages: state.messages,
        versions: state.versions.map(({ id, number, parentId, summary, changed, createdAt }) => ({
          id,
          number,
          parentId,
          summary,
          changed,
          createdAt,
        })),
        activeVersionId: state.activeVersionId,
        latestVersionId: state.versions.at(-1)?.id ?? null,
        build: pending
          ? {
              versionNumber: pending.version.number,
              first: pending.first,
              stepLabels: pending.steps.map((step) => step.label),
              stepIndex: pending.stepIndex,
              startedAt: pending.startedAt,
            }
          : null,
        queued: state.queue.length,
        submit,
        cancel,
        selectVersion,
        reset,
      }) satisfies StudioEngine,
    [
      state.projectName,
      state.messages,
      state.versions,
      state.activeVersionId,
      state.queue.length,
      pending,
      submit,
      cancel,
      selectVersion,
      reset,
    ],
  );

  const started = state.messages.length > 0;
  const progress = pending
    ? Math.round(
        (pending.steps.slice(0, pending.stepIndex).reduce((sum, s) => sum + s.ms, 0) /
          pending.steps.reduce((sum, s) => sum + s.ms, 0)) *
          100,
      )
    : 100;

  return {
    engine,
    state,
    activeVersion,
    previousVersion,
    latestVersion,
    started,
    progress,
    submit,
    set,
    selectVersion,
    reset,
    cancel,
  };
}

export type Studio = ReturnType<typeof useStudio>;
