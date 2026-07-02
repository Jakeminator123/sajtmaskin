"use client";

import { useCallback, useEffect, useRef } from "react";
import { useOpenClawStore, type OpenClawMessage } from "@/lib/openclaw/openclaw-store";

/**
 * Dispatched on `window` after a SUCCESSFUL OpenClaw prompt edit so the builder
 * can adopt the new version exactly like a normal quick-edit save (select it,
 * refresh the version list, keep the hot-patched preview). The widget lives
 * outside the builder React tree, so a window event is the reverse channel.
 * Listener: `useBuilderPageController` (kept as a matching string literal there
 * so deleting this feature never breaks the builder import graph).
 */
export const OPENCLAW_EDIT_APPLIED_EVENT = "sajtmaskin:openclaw-edit-applied";

/**
 * Dispatched on `window` when the edit was rejected because the widget's base
 * version is stale (HTTP 409 / `stale_base_version`). The builder listens and
 * re-syncs to the server's preferred version so the next edit builds on the
 * live version instead of re-failing. Same reverse-channel + string-literal
 * pattern as {@link OPENCLAW_EDIT_APPLIED_EVENT}.
 */
export const OPENCLAW_EDIT_STALE_EVENT = "sajtmaskin:openclaw-edit-stale";

function makeId() {
  return `oc-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ActiveBuilderTarget {
  chatId: string;
  activeVersionId: string | null;
}

/** Read the builder chat/version the widget is currently attached to. */
function readActiveBuilderTarget(): ActiveBuilderTarget | null {
  if (typeof window === "undefined") return null;
  const ctx = window.__SITEMASKIN_CONTEXT;
  const chatId = typeof ctx?.chatId === "string" ? ctx.chatId : null;
  if (!chatId) return null;
  const activeVersionId =
    typeof ctx?.activeVersionId === "string" ? ctx.activeVersionId : null;
  return { chatId, activeVersionId };
}

interface EditResponse {
  ok?: boolean;
  versionId?: string;
  changedFiles?: string[];
  summary?: string | null;
  previewUrl?: string | null;
  previewSessionId?: string | null;
  previewMode?: string | null;
  previewError?: string;
  error?: string;
  reason?: string;
  serverPreferredVersionId?: string;
}

function describeEditError(status: number, data: EditResponse | null): string {
  if (status === 404) {
    return "Redigeringsläget är inte aktiverat på den här miljön.";
  }
  if (
    status === 409 ||
    data?.reason === "stale_base_version" ||
    data?.error === "stale_base_version"
  ) {
    return "Sajten har ändrats sedan du senast såg den. Ladda om förhandsvisningen och försök igen.";
  }
  if (data?.reason === "integrations_base") {
    return (
      data.error ??
      "Den här versionen kan inte snabbredigeras. Använd builder-chatten för större ändringar."
    );
  }
  if (data?.reason === "no_change") {
    return "Ingen ändring gjordes — jag hittade inget att ändra för det du bad om. Prova att formulera om mer specifikt (t.ex. vilken text eller färg).";
  }
  const detail = (data?.error && data.error.trim()) || "";
  return detail
    ? `Jag kunde inte genomföra ändringen: ${detail}`
    : `Jag kunde inte genomföra ändringen (fel ${status}).`;
}

/**
 * Edit-mode send: posts a natural-language instruction to POST
 * /api/openclaw/edit, which turns it into deterministic quick-edit ops on the
 * user's latest version and hot-patches the live preview. Reuses the shared
 * OpenClaw message store so results render inline in the same chat thread.
 * Isolated from `useOpenClawChat` so the feature is trivially removable.
 */
export function useOpenClawEdit() {
  const { addMessage, updateAssistantMessage, setStreaming, scopeKey } = useOpenClawStore();
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Snapshot of the builder scope this run is bound to. An async edit that
  // resolves after the user switched chats/sites must NOT clobber the new
  // scope's UI or dispatch a stale applied event.
  const scopeRef = useRef(scopeKey);

  // Abort any in-flight edit + reset when the builder scope changes (chat/site
  // switch) or on unmount — mirrors useOpenClawChat's scope reset so an edit
  // started for one chat can never resolve into another.
  useEffect(() => {
    scopeRef.current = scopeKey;
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      inFlightRef.current = false;
    };
  }, [scopeKey]);

  const stopEdit = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendEdit = useCallback(
    async (text: string) => {
      const instruction = text.trim();
      if (!instruction || inFlightRef.current) return;

      const userMsg: OpenClawMessage = {
        id: makeId(),
        role: "user",
        content: instruction,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      const placeholderId = makeId();
      addMessage({
        id: placeholderId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      });

      const target = readActiveBuilderTarget();
      if (!target) {
        updateAssistantMessage(
          placeholderId,
          "Jag kan bara redigera när du är inne i en byggd sajt — öppna projektet i buildern först.",
        );
        return;
      }

      const controller = new AbortController();
      const runScope = scopeRef.current;
      abortRef.current = controller;
      inFlightRef.current = true;
      setStreaming(true);
      updateAssistantMessage(placeholderId, "Redigerar din sajt...");

      // True only while THIS run is still the active one for the same scope —
      // guards every UI write + event dispatch below against a superseded run.
      const isCurrent = () =>
        abortRef.current === controller && scopeRef.current === runScope;

      try {
        const res = await fetch("/api/openclaw/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: target.chatId,
            instruction,
            ...(target.activeVersionId
              ? {
                  activeVersionId: target.activeVersionId,
                  engineLatestKnownVersionId: target.activeVersionId,
                }
              : {}),
          }),
          signal: controller.signal,
        });

        const data = (await res.json().catch(() => null)) as EditResponse | null;

        // Scope changed / run superseded while awaiting — do not touch the new
        // scope's chat thread or fire a cross-chat event.
        if (!isCurrent()) return;

        if (res.ok && data?.ok && data.versionId) {
          // Wire the new version back into the builder (select it, refresh the
          // version list, keep the hot-patched preview) via a window event the
          // builder listens for — mirroring the normal quick-edit save path.
          // Without this the edit is applied server-side but never shows in the
          // UI (which read as "no new version came"). `chatId` lets the builder
          // ignore events meant for a different chat.
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent(OPENCLAW_EDIT_APPLIED_EVENT, {
                detail: {
                  chatId: target.chatId,
                  versionId: data.versionId,
                  previewUrl: data.previewUrl ?? null,
                  previewSessionId: data.previewSessionId ?? null,
                  previewMode: data.previewMode ?? null,
                },
              }),
            );
          }
          const changed = data.changedFiles ?? [];
          const summary =
            (data.summary && data.summary.trim()) || "Ändringen är genomförd.";
          const fileLine =
            changed.length > 0 ? `\n\nÄndrade filer: ${changed.join(", ")}` : "";
          const previewLine = data.previewError
            ? `\n\n(Förhandsvisningen kunde inte uppdateras automatiskt: ${data.previewError})`
            : "";
          updateAssistantMessage(
            placeholderId,
            `${summary}${fileLine}${previewLine}\n\nEn ny version skapades och valdes — du kan återställa den i versionshistoriken.`,
          );
        } else {
          // Stale base: tell the builder to re-sync to the server's preferred
          // version so the next edit builds on the live version instead of
          // re-failing with the same 409.
          const isStale =
            res.status === 409 ||
            data?.reason === "stale_base_version" ||
            data?.error === "stale_base_version";
          if (isStale && typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent(OPENCLAW_EDIT_STALE_EVENT, {
                detail: {
                  chatId: target.chatId,
                  serverPreferredVersionId:
                    typeof data?.serverPreferredVersionId === "string"
                      ? data.serverPreferredVersionId
                      : null,
                },
              }),
            );
          }
          updateAssistantMessage(placeholderId, describeEditError(res.status, data));
        }
      } catch (e) {
        // Aborted (stop button / scope change): leave a neutral note rather than
        // a scary generic error, and only when this run still owns the UI.
        if (e instanceof DOMException && e.name === "AbortError") {
          if (isCurrent()) {
            updateAssistantMessage(placeholderId, "Redigeringen avbröts.");
          }
          return;
        }
        if (isCurrent()) {
          updateAssistantMessage(
            placeholderId,
            "Något gick fel när jag försökte redigera. Kontrollera anslutningen och försök igen.",
          );
        }
      } finally {
        // Only clear the shared streaming flag if this run is still the active
        // one — a superseded/scope-changed run must not stop streaming for the
        // run that replaced it.
        if (abortRef.current === controller) {
          inFlightRef.current = false;
          setStreaming(false);
          abortRef.current = null;
        }
      }
    },
    [addMessage, updateAssistantMessage, setStreaming],
  );

  return { sendEdit, stopEdit };
}
