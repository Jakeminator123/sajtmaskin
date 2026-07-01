"use client";

import { useCallback, useRef } from "react";
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
  const { addMessage, updateAssistantMessage, setStreaming } = useOpenClawStore();
  const inFlightRef = useRef(false);

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

      inFlightRef.current = true;
      setStreaming(true);
      updateAssistantMessage(placeholderId, "Redigerar din sajt...");

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
        });

        const data = (await res.json().catch(() => null)) as EditResponse | null;

        if (res.ok && data?.ok && data.versionId) {
          // Wire the new version back into the builder (select it, refresh the
          // version list, keep the hot-patched preview) via a window event the
          // builder listens for — mirroring the normal quick-edit save path.
          // Without this the edit is applied server-side but never shows in the
          // UI (which read as "no new version came").
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent(OPENCLAW_EDIT_APPLIED_EVENT, {
                detail: {
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
          updateAssistantMessage(placeholderId, describeEditError(res.status, data));
        }
      } catch {
        updateAssistantMessage(
          placeholderId,
          "Något gick fel när jag försökte redigera. Kontrollera anslutningen och försök igen.",
        );
      } finally {
        inFlightRef.current = false;
        setStreaming(false);
      }
    },
    [addMessage, updateAssistantMessage, setStreaming],
  );

  return { sendEdit };
}
