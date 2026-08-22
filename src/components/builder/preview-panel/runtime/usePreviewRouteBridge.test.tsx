import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PREVIEW_ROUTE_BRIDGE_MESSAGE,
  PREVIEW_ROUTE_BRIDGE_SOURCE,
  usePreviewRouteBridge,
} from "./usePreviewRouteBridge";

const PREVIEW_ORIGIN = "https://vm-test.fly.dev";
const PREVIEW_URL = `${PREVIEW_ORIGIN}/chat_1`;

function createHarness() {
  const child = {} as Window;
  const iframe = { contentWindow: child } as HTMLIFrameElement;
  return {
    child,
    iframeRef: { current: iframe },
  };
}

function postRoute(options: {
  child: Window;
  origin?: string;
  source?: MessageEventSource | null;
  stamp?: string;
  href?: string;
  previewSessionId?: string;
  versionId?: string;
  viewerId?: string;
}) {
  window.dispatchEvent(
    new MessageEvent("message", {
      source: options.source === undefined ? options.child : options.source,
      origin: options.origin ?? PREVIEW_ORIGIN,
      data: {
        type: PREVIEW_ROUTE_BRIDGE_MESSAGE,
        source: options.stamp ?? PREVIEW_ROUTE_BRIDGE_SOURCE,
        payload: {
          href: options.href ?? `${PREVIEW_ORIGIN}/chat_1/about?tab=team#lead`,
          previewSessionId: options.previewSessionId ?? "ps_1",
          versionId: options.versionId ?? "ver_1",
          viewerId: options.viewerId ?? "viewer_1",
        },
      },
    }),
  );
}

describe("usePreviewRouteBridge", () => {
  it("accepts a fully validated route change for the active tier-2 identity", () => {
    const { child, iframeRef } = createHarness();
    const { result } = renderHook(() =>
      usePreviewRouteBridge({
        previewUrl: PREVIEW_URL,
        versionId: "ver_1",
        activePreviewSessionId: "ps_1",
        viewerId: "viewer_1",
        iframeRef,
      }),
    );

    act(() => postRoute({ child }));

    expect(result.current).toBe("/about");
  });

  it.each([
    ["wrong window", { source: {} as Window }],
    ["wrong origin", { origin: "https://evil.example" }],
    ["opaque origin", { origin: "null" }],
    ["wrong stamp", { stamp: "generated-app" }],
    ["wrong session", { previewSessionId: "ps_old" }],
    ["wrong version", { versionId: "ver_old" }],
    ["wrong viewer", { viewerId: "viewer_old" }],
    ["cross-session path", { href: `${PREVIEW_ORIGIN}/chat_2/about` }],
    ["cross-origin href", { href: "https://evil.example/chat_1/about" }],
  ])("rejects %s", (_label, overrides) => {
    const { child, iframeRef } = createHarness();
    const { result } = renderHook(() =>
      usePreviewRouteBridge({
        previewUrl: PREVIEW_URL,
        versionId: "ver_1",
        activePreviewSessionId: "ps_1",
        viewerId: "viewer_1",
        iframeRef,
      }),
    );

    act(() => postRoute({ child, ...overrides }));

    expect(result.current).toBeNull();
  });

  it("makes an observed route inert immediately when preview identity changes", () => {
    const { child, iframeRef } = createHarness();
    const { result, rerender } = renderHook(
      ({ versionId }) =>
        usePreviewRouteBridge({
          previewUrl: PREVIEW_URL,
          versionId,
          activePreviewSessionId: "ps_1",
          viewerId: "viewer_1",
          iframeRef,
        }),
      { initialProps: { versionId: "ver_1" } },
    );
    act(() => postRoute({ child }));
    expect(result.current).toBe("/about");

    rerender({ versionId: "ver_2" });

    expect(result.current).toBeNull();
  });
});
