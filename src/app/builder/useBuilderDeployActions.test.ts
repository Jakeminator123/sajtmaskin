import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useBuilderDeployActions } from "./useBuilderDeployActions";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  }),
}));

function makeArgs(
  overrides: Partial<Parameters<typeof useBuilderDeployActions>[0]> = {},
): Parameters<typeof useBuilderDeployActions>[0] {
  return {
    selectedVersionIdRef: { current: null },
    latestVersionIdRef: { current: null },
    chatId: "chat_1",
    activeVersionId: "ver_1",
    activeDeploymentId: null,
    deployReadiness: null,
    isDeploying: false,
    isMediaEnabled: false,
    enableBlobMedia: false,
    domainQuery: "",
    deployNameInput: "Mitt projekt",
    isDeployNameSaving: false,
    appProjectId: "proj_1",
    appProjectName: "Mitt projekt",
    hydratedProjectName: null,
    applyInstructionsOnce: false,
    pendingInstructionsRef: { current: null },
    pendingInstructionsOnceRef: { current: null },
    setSelectedVersionId: vi.fn(),
    setIsDeploying: vi.fn(),
    setDomainManagerOpen: vi.fn(),
    setLastDeployVercelProjectId: vi.fn(),
    setActiveDeploymentId: vi.fn(),
    setDomainResults: vi.fn(),
    setIsDomainSearching: vi.fn(),
    setDeployNameDialogOpen: vi.fn(),
    setDeployNameError: vi.fn(),
    setDeployNameInput: vi.fn(),
    setIsDeployNameSaving: vi.fn(),
    setPendingProjectName: vi.fn(),
    setAppProjectName: vi.fn(),
    setCustomInstructions: vi.fn(),
    setApplyInstructionsOnce: vi.fn(),
    resolveSuggestedProjectName: vi.fn(() => "Mitt projekt"),
    mutateChat: vi.fn(),
    mutateVersions: vi.fn(),
    validateCss: vi.fn(async () => null),
    ...overrides,
  };
}

function findPreferencesCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.find(
    (call) => typeof call[0] === "string" && call[0].includes("/preferences"),
  );
}

function findDeployCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.find(
    (call) => typeof call[0] === "string" && call[0].includes("/api/v0/deployments"),
  );
}

// #486 Fix B: `mergeSeoPatch` (`preferences/route.ts`) keeps the persisted
// value for any OMITTED field — only an explicit `null` clears it. A blank
// siteUrl must therefore be sent as `null`, not omitted, or a previously
// saved SEO-fallback URL could never be cleared from the builder UI.
describe("useBuilderDeployActions — handleConfirmDeploy SEO preferences PATCH (#486 Fix B)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (typeof url === "string" && url.includes("/preferences")) {
          return { ok: true, json: async () => ({}) } as Response;
        }
        return {
          ok: true,
          json: async () => ({ url: "https://demo.vercel.app", id: "dep_1" }),
        } as Response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends siteUrl: null when opting in with a blank siteUrl (clears the fallback)", async () => {
    const { result } = renderHook(() => useBuilderDeployActions(makeArgs()));

    await act(async () => {
      await result.current.handleConfirmDeploy({
        seo: { optIn: true, siteUrl: "   " },
      });
    });

    const call = findPreferencesCall(fetch as unknown as ReturnType<typeof vi.fn>);
    expect(call).toBeTruthy();
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body).toEqual({ seo: { optIn: true, siteUrl: null } });
  });

  it("keeps a real siteUrl when provided", async () => {
    const { result } = renderHook(() => useBuilderDeployActions(makeArgs()));

    await act(async () => {
      await result.current.handleConfirmDeploy({
        seo: { optIn: true, siteUrl: "https://example.com" },
      });
    });

    const call = findPreferencesCall(fetch as unknown as ReturnType<typeof vi.fn>);
    expect(call).toBeTruthy();
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body).toEqual({ seo: { optIn: true, siteUrl: "https://example.com" } });
  });

  it("sends only optIn:false when opting out (no siteUrl field at all)", async () => {
    const { result } = renderHook(() => useBuilderDeployActions(makeArgs()));

    await act(async () => {
      await result.current.handleConfirmDeploy({
        seo: { optIn: false, siteUrl: "" },
      });
    });

    const call = findPreferencesCall(fetch as unknown as ReturnType<typeof vi.fn>);
    expect(call).toBeTruthy();
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body).toEqual({ seo: { optIn: false } });
  });
});

// #519 P2 (Codex review round 2): the deploy body OMITS `siteUrl` when it's
// blank, so `resolveDeploySeoOptions` falls back to whatever is still
// persisted. If the clear-PATCH fails, a silent best-effort deploy would
// publish STALE robots/sitemap/canonical metadata. Only the clear-fallback
// case must abort; setting a real URL keeps today's best-effort (the deploy
// body carries the new value regardless of PATCH success).
describe("useBuilderDeployActions — handleConfirmDeploy aborts deploy on a failed SEO-fallback clear (#519 P2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aborts the deploy and shows an error toast when clearing siteUrl and the PATCH fails (500)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (typeof url === "string" && url.includes("/preferences")) {
          return { ok: false, status: 500, json: async () => ({}) } as Response;
        }
        return {
          ok: true,
          json: async () => ({ url: "https://demo.vercel.app", id: "dep_1" }),
        } as Response;
      }),
    );
    const { result } = renderHook(() => useBuilderDeployActions(makeArgs()));

    await act(async () => {
      await result.current.handleConfirmDeploy({
        seo: { optIn: true, siteUrl: "   " },
      });
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(findPreferencesCall(fetchMock)).toBeTruthy();
    expect(findDeployCall(fetchMock)).toBeFalsy();
    expect(toast.error).toHaveBeenCalled();
  });

  it("continues the deploy when clearing siteUrl and the PATCH succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (typeof url === "string" && url.includes("/preferences")) {
          return { ok: true, json: async () => ({}) } as Response;
        }
        return {
          ok: true,
          json: async () => ({ url: "https://demo.vercel.app", id: "dep_1" }),
        } as Response;
      }),
    );
    const { result } = renderHook(() => useBuilderDeployActions(makeArgs()));

    await act(async () => {
      await result.current.handleConfirmDeploy({
        seo: { optIn: true, siteUrl: "   " },
      });
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(findPreferencesCall(fetchMock)).toBeTruthy();
    expect(findDeployCall(fetchMock)).toBeTruthy();
  });

  it("continues the deploy (best-effort) when setting a real siteUrl and the PATCH fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (typeof url === "string" && url.includes("/preferences")) {
          return { ok: false, status: 500, json: async () => ({}) } as Response;
        }
        return {
          ok: true,
          json: async () => ({ url: "https://demo.vercel.app", id: "dep_1" }),
        } as Response;
      }),
    );
    const { result } = renderHook(() => useBuilderDeployActions(makeArgs()));

    await act(async () => {
      await result.current.handleConfirmDeploy({
        seo: { optIn: true, siteUrl: "https://example.com" },
      });
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(findPreferencesCall(fetchMock)).toBeTruthy();
    expect(findDeployCall(fetchMock)).toBeTruthy();
  });
});
