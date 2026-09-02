import { getPromptAssistModelLabel } from "@/lib/builder/defaults";
import { MODEL_LABELS, isCanonicalModelId } from "@/lib/models/catalog";
import { useEffect } from "react";
import type { BuilderViewModel } from "../useBuilderPageController";
import {
  OPENCLAW_CONTEXT_CODE_MAX_CHARS,
  buildRecentContextMessages,
} from "./context-helpers";
import type { useShellRegistryInsert } from "./use-registry-insert";
import type { useShellVersionFollowup } from "./use-version-followup";

/** Dev image observer + OpenClaw window context — contiguous effects after F3/tips. */
export function useShellDevContextEffects(
  vm: BuilderViewModel,
  {
    activeVersionStatus,
    activeVersionIsLatest,
    latestPendingReply,
  }: {
    activeVersionStatus: ReturnType<typeof useShellVersionFollowup>["activeVersionStatus"];
    activeVersionIsLatest: boolean;
    latestPendingReply: ReturnType<typeof useShellRegistryInsert>["latestPendingReply"];
  },
) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const seen = new Set<string>();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const imgs =
            node.tagName === "IMG"
              ? [node as HTMLImageElement]
              : Array.from(node.querySelectorAll<HTMLImageElement>("img[src]"));

          for (const img of imgs) {
            const src = img.src || img.getAttribute("src") || "";
            if (!src || src.startsWith("data:") || src.startsWith("blob:")) continue;
            try {
              const url = new URL(src, window.location.origin);
              if (url.origin === window.location.origin) continue;
              if (seen.has(url.href)) continue;
              seen.add(url.href);

              const closestLabel =
                img.alt ||
                img.closest("[data-label]")?.getAttribute("data-label") ||
                img.closest("[aria-label]")?.getAttribute("aria-label") ||
                img.parentElement?.textContent?.trim().slice(0, 60) ||
                "(unknown)";

              console.info(
                `%c[ExtImg]%c ${closestLabel}\n${url.href}`,
                "color:#f59e0b;font-weight:bold",
                "color:inherit",
              );
            } catch { /* invalid URL */ }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const selectedModelLabel = isCanonicalModelId(vm.selectedModelTier)
      ? MODEL_LABELS[vm.selectedModelTier]
      : vm.selectedModelTier;

    window.__SITEMASKIN_CONTEXT = {
      page: "builder",
      projectId: vm.appProjectId,
      chatId: vm.chatId,
      buildMethod: vm.buildMethod,
      activeVersionId: vm.activeVersionId,
      demoUrl: vm.currentPreviewUrl,
      selectedModelTier: vm.selectedModelTier,
      selectedModelLabel,
      promptAssistModel: vm.promptAssistModel,
      promptAssistLabel: getPromptAssistModelLabel(vm.promptAssistModel),
      promptAssistDeep: vm.promptAssistDeep,
      scaffoldMode: vm.scaffoldMode,
      scaffoldId: vm.scaffoldId,
      recentMessages: buildRecentContextMessages(vm.messages),
      currentCode: vm.currentPageCode?.slice(0, OPENCLAW_CONTEXT_CODE_MAX_CHARS) || null,
      isStreaming: vm.isAnyStreaming,
      // `isStreaming` drops as soon as the stream closes, while post-checks may
      // still be running. The armed-autonomy handshake needs the version phase
      // too, so it resumes on a genuinely terminal turn and stops on a failed
      // one (`debug/armed-continuation.ts`). `activeVersionIsLatest` comes with
      // it because the status is projected for the FOCUSED version — a user
      // reading version history would otherwise report a terminal status while
      // a newer version is still being built.
      activeVersionStatus,
      activeVersionIsLatest,
      // Monotonic, unlike the truncated `recentMessages` — growth is how the
      // handshake recognises a turn too short to catch mid-stream.
      chatMessageCount: vm.messages.length,
      // A pending question or plan approval belongs to the user, not to armed
      // autonomy: sending past it would start a new generation and drop the
      // plan the builder is holding. Both halves are needed — `isAwaitingInput`
      // only sees the `awaiting-input` tool part, while a held plan shows up as
      // a pending reply (the same pair that gates the dossier catalogue below).
      awaitingInput: vm.isAwaitingInput || Boolean(latestPendingReply),
    };
    // Landing and kostnadsfri announce every context write with this event, and
    // OpenClaw's scope sync listens for it — the builder never sent it, so an
    // in-builder chat switch (same pathname, new chatId) kept the OLD OpenClaw
    // scope alive: conversation, armed mandate and granted extra powers all
    // survived into the next chat. The store's scope reset only works if this
    // surface reports its context changes like the other two do.
    window.dispatchEvent(new CustomEvent("sajtmaskin:context-updated"));
    return () => {
      delete window.__SITEMASKIN_CONTEXT;
      window.dispatchEvent(new CustomEvent("sajtmaskin:context-updated"));
    };
  }, [
    vm.appProjectId,
    vm.chatId,
    vm.buildMethod,
    vm.activeVersionId,
    vm.currentPreviewUrl,
    vm.selectedModelTier,
    vm.promptAssistModel,
    vm.promptAssistDeep,
    vm.scaffoldMode,
    vm.scaffoldId,
    vm.messages,
    vm.currentPageCode,
    vm.isAnyStreaming,
    activeVersionStatus,
    activeVersionIsLatest,
    vm.isAwaitingInput,
    latestPendingReply,
  ]);

}
