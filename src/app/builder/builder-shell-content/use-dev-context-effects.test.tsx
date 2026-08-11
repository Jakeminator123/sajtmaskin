import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useShellDevContextEffects } from "./use-dev-context-effects";
import type { BuilderViewModel } from "../useBuilderPageController";
import type { useShellVersionFollowup } from "./use-version-followup";

type VersionStatus = ReturnType<typeof useShellVersionFollowup>["activeVersionStatus"];

/** Minimal vm stub — only the fields the context effect actually reads. */
function makeVm(chatId: string | null): BuilderViewModel {
  return {
    appProjectId: "proj-1",
    chatId,
    buildMethod: "own-engine",
    activeVersionId: "v-1",
    currentPreviewUrl: null,
    selectedModelTier: "standard",
    promptAssistModel: "auto",
    promptAssistDeep: false,
    scaffoldMode: "auto",
    scaffoldId: null,
    messages: [],
    currentPageCode: null,
    isAnyStreaming: false,
    isAwaitingInput: false,
  } as unknown as BuilderViewModel;
}

function renderContextEffects(chatId: string | null) {
  return renderHook(
    ({ id }: { id: string | null }) =>
      useShellDevContextEffects(makeVm(id), {
        activeVersionStatus: null as unknown as VersionStatus,
        activeVersionIsLatest: true,
        latestPendingReply: null,
      }),
    { initialProps: { id: chatId } },
  );
}

afterEach(() => {
  delete window.__SITEMASKIN_CONTEXT;
});

// OpenClaw's scope sync only learns about builder context changes through this
// event. Landing and kostnadsfri already announce their writes; the builder
// did not, so an in-builder chat switch (same pathname, new chatId) silently
// kept the old OpenClaw scope — conversation, armed mandate and granted extra
// powers leaked into the next chat.
describe("useShellDevContextEffects — context-updated event", () => {
  it("announces the context write, a chat switch and the teardown", () => {
    const onContextUpdated = vi.fn();
    window.addEventListener("sajtmaskin:context-updated", onContextUpdated);
    try {
      const { rerender, unmount } = renderContextEffects("chat-a");
      expect(window.__SITEMASKIN_CONTEXT?.chatId).toBe("chat-a");
      expect(onContextUpdated).toHaveBeenCalledTimes(1);

      // Chat switch on the same pathname — exactly the case the event covers.
      rerender({ id: "chat-b" });
      expect(window.__SITEMASKIN_CONTEXT?.chatId).toBe("chat-b");
      // Dep change reruns the effect: one cleanup dispatch + one write dispatch.
      expect(onContextUpdated).toHaveBeenCalledTimes(3);

      unmount();
      expect(window.__SITEMASKIN_CONTEXT).toBeUndefined();
      expect(onContextUpdated).toHaveBeenCalledTimes(4);
    } finally {
      window.removeEventListener("sajtmaskin:context-updated", onContextUpdated);
    }
  });
});
