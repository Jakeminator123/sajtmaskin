"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  getDefaultPaletteState,
  normalizePaletteState,
  type PaletteState,
} from "@/lib/builder/palette";
import type { ChatMessage } from "@/lib/builder/types";
import { getProject, saveProjectData } from "@/lib/project-client";
import { debugLog } from "@/lib/utils/debug";
import type { BuilderEntryKind } from "../builder-entry";
import { asRecord, parsePreviewOverride } from "../builder-page-preview-helpers";

type Params = {
  appProjectId: string | null;
  chatId: string | null;
  chatIdParam: string | null;
  entryKind: BuilderEntryKind;
  hasEntryParams: boolean;
  isAuthLoading: boolean;
  paletteState: PaletteState;
  projectParam: string | null;
  autoProjectInitRef: MutableRefObject<boolean>;
  lastPaletteSavedRef: MutableRefObject<string | null>;
  lastProjectIdRef: MutableRefObject<string | null>;
  paletteLoadedRef: MutableRefObject<boolean>;
  router: { replace: (url: string) => void };
  searchParams: ReadonlyURLSearchParams;
  setAppProjectId: Dispatch<SetStateAction<string | null>>;
  setAppProjectName: Dispatch<SetStateAction<string | null>>;
  setAuthModalReason: Dispatch<SetStateAction<"builder" | "save" | null>>;
  setClearedPreviewVersionId: Dispatch<SetStateAction<string | null>>;
  setEntryIntentActive: Dispatch<SetStateAction<boolean>>;
  setPaletteState: Dispatch<SetStateAction<PaletteState>>;
  setServerProjectChatId: Dispatch<SetStateAction<string | null>>;
  setServerProjectDemoUrl: Dispatch<SetStateAction<string | null>>;
  setServerProjectMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setServerProjectPreviewOverrideUrl: Dispatch<SetStateAction<string | null>>;
  setServerProjectPreviewOverrideVersionId: Dispatch<SetStateAction<string | null>>;
};

/**
 * Project hydration: remembers the last project, auto-creates one for a blank
 * entry, and loads the project row (name, palette, messages, demo URL and the
 * persisted preview override) whenever the active project changes.
 */
export function useBuilderProjectHydration({
  appProjectId,
  chatId,
  chatIdParam,
  entryKind,
  hasEntryParams,
  isAuthLoading,
  paletteState,
  projectParam,
  autoProjectInitRef,
  lastPaletteSavedRef,
  lastProjectIdRef,
  paletteLoadedRef,
  router,
  searchParams,
  setAppProjectId,
  setAppProjectName,
  setAuthModalReason,
  setClearedPreviewVersionId,
  setEntryIntentActive,
  setPaletteState,
  setServerProjectChatId,
  setServerProjectDemoUrl,
  setServerProjectMessages,
  setServerProjectPreviewOverrideUrl,
  setServerProjectPreviewOverrideVersionId,
}: Params) {
  /** Prevents duplicate `createProject` while the dynamic-import path is in flight. */
  const autoProjectCreateInFlightRef = useRef(false);

  // AppProjectId localStorage persist
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!appProjectId) return;
    try {
      localStorage.setItem("sajtmaskin:lastProjectId", appProjectId);
    } catch {
      /* ignore */
    }
  }, [appProjectId]);

  // Auto project init
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isAuthLoading) return;
    if (autoProjectInitRef.current) return;
    if (autoProjectCreateInFlightRef.current) return;
    if (appProjectId || projectParam || chatIdParam || hasEntryParams) {
      return;
    }

    let restored: string | null = null;
    try {
      restored = localStorage.getItem("sajtmaskin:lastProjectId");
    } catch {
      restored = null;
    }

    if (restored) {
      autoProjectInitRef.current = true;
      setAppProjectId(restored);
      const params = new URLSearchParams(searchParams.toString());
      params.set("project", restored);
      router.replace(`/builder?${params.toString()}`);
      return;
    }

    autoProjectCreateInFlightRef.current = true;
    import("@/lib/project-client")
      .then(({ createProject }) =>
        createProject("Untitled Project")
          .then((project) => {
            autoProjectInitRef.current = true;
            autoProjectCreateInFlightRef.current = false;
            setAppProjectId(project.id);
            try {
              localStorage.setItem("sajtmaskin:lastProjectId", project.id);
            } catch {
              /* ignore */
            }
            const params = new URLSearchParams(searchParams.toString());
            params.set("project", project.id);
            router.replace(`/builder?${params.toString()}`);
          })
          .catch((error) => {
            debugLog("builder", "Auto project create failed", error);
            autoProjectCreateInFlightRef.current = false;
            autoProjectInitRef.current = false;
            const status = (error as { status?: number })?.status;
            if (status === 401 || status === 403) {
              setAuthModalReason("builder");
            } else {
              toast.error("Kunde inte skapa projekt automatiskt. Försök igen eller logga in.");
            }
          }),
      )
      .catch((err) => {
        autoProjectCreateInFlightRef.current = false;
        autoProjectInitRef.current = false;
        debugLog("builder", "Failed to load project-client for auto init", err);
      });
  }, [
    appProjectId,
    projectParam,
    chatIdParam,
    hasEntryParams,
    isAuthLoading,
    autoProjectInitRef,
    setAppProjectId,
    router,
    searchParams,
    setAuthModalReason,
  ]);

  // Entry intent sync
  useEffect(() => {
    setEntryIntentActive(entryKind === "prompt-handoff" || entryKind === "audit");
  }, [entryKind, setEntryIntentActive]);

  useEffect(() => {
    if (chatId) setEntryIntentActive(false);
  }, [chatId, setEntryIntentActive]);

  // Project name / palette / messages / demoUrl load
  useEffect(() => {
    if (!appProjectId) {
      setAppProjectName(null);
      setPaletteState(getDefaultPaletteState());
      paletteLoadedRef.current = false;
      lastPaletteSavedRef.current = null;
      lastProjectIdRef.current = null;
      setServerProjectChatId(null);
      setServerProjectMessages([]);
      setServerProjectDemoUrl(null);
      setServerProjectPreviewOverrideUrl(null);
      setServerProjectPreviewOverrideVersionId(null);
      setClearedPreviewVersionId(null);
      return;
    }
    const previousProjectId = lastProjectIdRef.current;
    lastProjectIdRef.current = appProjectId;
    if (previousProjectId !== appProjectId) {
      setServerProjectChatId(null);
      setServerProjectMessages([]);
      setServerProjectDemoUrl(null);
      setServerProjectPreviewOverrideUrl(null);
      setServerProjectPreviewOverrideVersionId(null);
      setClearedPreviewVersionId(null);
    }
    let isActive = true;
    getProject(appProjectId)
      .then((result) => {
        if (!isActive) return;
        setAppProjectName(result.project?.name ?? null);
        const nextPalette = normalizePaletteState(result.data?.meta?.palette);
        const defaultPalette = getDefaultPaletteState();
        setPaletteState((prev) => {
          const isNewProject = previousProjectId !== null && previousProjectId !== appProjectId;
          if (nextPalette.selections.length === 0) {
            if (!isNewProject && prev.selections.length > 0) return prev;
            return defaultPalette;
          }
          return nextPalette;
        });
        paletteLoadedRef.current = true;

        const serverChatId =
          typeof result.data?.chat_id === "string" && result.data.chat_id.trim().length > 0
            ? result.data.chat_id.trim()
            : null;
        setServerProjectChatId(serverChatId);

        const serverMsgs = Array.isArray(result.data?.messages) ? result.data.messages : [];
        setServerProjectMessages(serverMsgs as ChatMessage[]);

        const serverDemoUrl =
          typeof result.data?.demo_url === "string" ? result.data.demo_url : null;
        setServerProjectDemoUrl(serverDemoUrl);
        const previewOverride = parsePreviewOverride(asRecord(result.data?.meta)?.previewOverride);
        setServerProjectPreviewOverrideUrl(previewOverride.url);
        setServerProjectPreviewOverrideVersionId(previewOverride.versionId);
      })
      .catch((error) => {
        debugLog("builder", "Failed to load project name", error);
        if (error instanceof Error && error.message.toLowerCase().includes("project not found")) {
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            if (params.get("project") === appProjectId) {
              params.delete("project");
              const query = params.toString();
              window.history.replaceState(null, "", query ? `/builder?${query}` : "/builder");
            }
          }
          setAppProjectId(null);
        }
      });
    return () => {
      isActive = false;
    };
  }, [appProjectId, setAppProjectName, setPaletteState, paletteLoadedRef, lastPaletteSavedRef, lastProjectIdRef, setServerProjectChatId, setServerProjectMessages, setServerProjectDemoUrl, setServerProjectPreviewOverrideUrl, setServerProjectPreviewOverrideVersionId, setClearedPreviewVersionId, setAppProjectId]);

  // Palette persist
  useEffect(() => {
    if (!appProjectId) return;
    if (!paletteLoadedRef.current) return;
    const serialized = JSON.stringify(paletteState);
    if (serialized === lastPaletteSavedRef.current) return;
    lastPaletteSavedRef.current = serialized;
    saveProjectData(appProjectId, {
      meta: { palette: paletteState },
    }).catch((error) => {
      debugLog("builder", "Failed to persist palette state", error);
    });
  }, [appProjectId, paletteState, paletteLoadedRef, lastPaletteSavedRef]);
}
