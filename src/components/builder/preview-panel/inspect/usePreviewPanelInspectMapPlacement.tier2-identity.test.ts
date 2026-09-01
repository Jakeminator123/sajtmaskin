// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState, type RefObject } from "react";
import {
  canAttachInspectorMapIdentity,
  isInspectorMapIdentityReady,
  usePreviewPanelInspectMapPlacement,
} from "./usePreviewPanelInspectMapPlacement";

const TIER2_URL = "https://vm-fly-jakem.fly.dev/57027ae6-19df-48cb-aa47-9c42a626db50";
const SHIM_URL = "http://localhost:3000/api/preview-render?id=legacy";

function mapPlacementHarness(overrides: {
  previewUrl: string;
  previewSessionId?: string | null;
  identityReady?: boolean;
  chatId?: string | null;
  versionId?: string | null;
  lifecycleToken?: string | null;
}) {
  const iframeRef = { current: null } as RefObject<HTMLIFrameElement | null>;
  return renderHook(() => {
    const [inspectMode, setInspectMode] = useState(false);
    return usePreviewPanelInspectMapPlacement({
      inspectorEnabled: true,
      chatId: overrides.chatId ?? "chat_1",
      previewUrl: overrides.previewUrl,
      versionId: overrides.versionId ?? "ver_1",
      previewSessionId: overrides.previewSessionId ?? null,
      lifecycleToken: overrides.lifecycleToken,
      identityReady: overrides.identityReady ?? true,
      placementMode: true,
      inspectMode,
      setInspectMode,
      iframeLoading: false,
      externalLoading: false,
      iframeRef,
      fetchFilesForRegistry: vi.fn(),
      setInspectStatus: vi.fn(),
      setLastCodeMatch: vi.fn(),
      inspectEngine: "map",
    });
  });
}

describe("inspector map identity — same truth as the payload", () => {
  it("refuses a tier-2 preview without a session", () => {
    expect(
      isInspectorMapIdentityReady({
        previewUrl: TIER2_URL,
        chatId: "chat_1",
        versionId: "ver_1",
        previewSessionId: null,
        lifecycleToken: "life_1",
      }),
    ).toBe(false);
    expect(
      canAttachInspectorMapIdentity({
        chatId: "chat_1",
        versionId: "ver_1",
        previewSessionId: null,
        lifecycleToken: "life_1",
      }),
    ).toBe(false);
  });

  it("keeps the compat-shim session-less escape hatch", () => {
    expect(
      isInspectorMapIdentityReady({
        previewUrl: SHIM_URL,
        chatId: "chat_1",
        versionId: "ver_1",
        previewSessionId: null,
        lifecycleToken: undefined,
      }),
    ).toBe(true);
  });
});

describe("usePreviewPanelInspectMapPlacement — no tuple-less tier-2 fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not POST a tuple-less body to /api/inspector-element-map for a tier-2 URL without session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const rendered = mapPlacementHarness({
      previewUrl: TIER2_URL,
      previewSessionId: null,
      // Simulerar den gamla grinden som blev sann p.g.a. `!session`.
      identityReady: true,
      lifecycleToken: "life_1",
    });

    await waitFor(() => {
      expect(rendered.result.current.inspectorUnavailable).toBe(true);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    rendered.unmount();
  });

  it("still fetches the compat-shim path without a session tuple", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const rendered = mapPlacementHarness({
      previewUrl: SHIM_URL,
      previewSessionId: null,
      identityReady: true,
      lifecycleToken: undefined,
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/inspector-element-map");
    const body = JSON.parse(String((init as { body?: string } | undefined)?.body));
    expect(body).toEqual(
      expect.objectContaining({
        url: SHIM_URL,
      }),
    );
    expect(body).not.toHaveProperty("previewSessionId");
    expect(body).not.toHaveProperty("chatId");
    expect(body).not.toHaveProperty("versionId");

    rendered.unmount();
  });
});
