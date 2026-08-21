import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const launchCaptureBrowserMock = vi.hoisted(() => vi.fn());
const applyCaptureRequestGateMock = vi.hoisted(() => vi.fn(async () => {}));
const getActivePreviewSessionAsyncMock = vi.hoisted(() => vi.fn());
const fetchPreviewHostReadinessVerdictMock = vi.hoisted(() => vi.fn());
const isLiveReviewEnabledMock = vi.hoisted(() => vi.fn(() => false));
const persistLiveReviewJpegMock = vi.hoisted(() =>
  vi.fn(async () => "https://blob.example/live-review.jpg"),
);

vi.mock("@/lib/capture/browser", () => ({
  launchCaptureBrowser: launchCaptureBrowserMock,
  applyCaptureRequestGate: applyCaptureRequestGateMock,
}));
vi.mock("@/lib/gen/preview/session-store", () => ({
  getActivePreviewSessionAsync: getActivePreviewSessionAsyncMock,
}));
vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  fetchPreviewHostReadinessVerdict: fetchPreviewHostReadinessVerdictMock,
}));
vi.mock("@/lib/gen/verify/live-review", () => ({
  isLiveReviewEnabled: isLiveReviewEnabledMock,
  persistLiveReviewJpeg: persistLiveReviewJpegMock,
}));

import {
  evaluateBrowserRuntimeIssues,
  evaluateProductDomSnapshot,
  evaluateRuntimeErrors,
  CRAWL_DEADLINE_MS,
  isAllowedProductPostcheckUrl,
  isHydrationConsoleError,
  isPreviewHostBootPage,
  isRenderFatalError,
  productPostcheckSkipReasonFromError,
  resolveCrawlDeadlineMs,
  runProductPostcheck,
  selectCrawlRoutes,
  shouldIgnoreConsoleError,
  shouldIgnoreFailedRequest,
  shouldIgnoreHttpStatus,
  type BrowserRuntimeIssue,
  type ProductDomEvaluation,
  type ProductPostcheckWarning,
} from "./product-postcheck";

function codes(input: ProductPostcheckWarning[] | ProductDomEvaluation): string[] {
  const warnings = Array.isArray(input) ? input : input.warnings;
  return warnings.map((warning) => warning.code).sort();
}

describe("isAllowedProductPostcheckUrl", () => {
  it("allows local dev and known Fly preview host", () => {
    expect(isAllowedProductPostcheckUrl("http://localhost:3000/demo")).toBe(true);
    expect(isAllowedProductPostcheckUrl("http://127.0.0.1:3000/demo")).toBe(true);
    expect(isAllowedProductPostcheckUrl("https://vm-fly-jakem.fly.dev/chat_1")).toBe(true);
  });

  it("rejects arbitrary external URLs", () => {
    expect(isAllowedProductPostcheckUrl("https://example.com")).toBe(false);
    expect(isAllowedProductPostcheckUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedProductPostcheckUrl("not a url")).toBe(false);
  });
});

describe("evaluateProductDomSnapshot", () => {
  it("reports broken anchors", () => {
    const evaluation = evaluateProductDomSnapshot(
      {
        anchors: [{ href: "#missing", text: "Till sektion", targetExists: false }],
        images: [],
        ctas: [],
        forms: [],
      },
      { status: "not_applicable" },
    );

    expect(codes(evaluation)).toEqual(["broken_anchor"]);
    expect(evaluation.warnings[0]?.href).toBe("#missing");
    expect(evaluation.productBlocked).toBe(false);
  });

  it("reports broken images with naturalWidth 0", () => {
    const evaluation = evaluateProductDomSnapshot(
      {
        anchors: [],
        images: [
          {
            src: "https://images.unsplash.com/broken.jpg",
            alt: "Porträtt",
            naturalWidth: 0,
            complete: true,
          },
        ],
        ctas: [],
        forms: [],
      },
      { status: "not_applicable" },
    );

    expect(codes(evaluation)).toEqual(["broken_image"]);
    expect(evaluation.warnings[0]?.src).toContain("broken.jpg");
    expect(evaluation.productBlocked).toBe(false);
  });

  it("reports CTA buttons and links without targets/actions", () => {
    const evaluation = evaluateProductDomSnapshot(
      {
        anchors: [],
        images: [],
        ctas: [
          {
            tag: "a",
            text: "Kom igång",
            href: "#",
            disabled: false,
            ariaDisabled: false,
            ariaControls: null,
            ariaExpanded: null,
            type: null,
            inForm: false,
            formAction: null,
            demoOnly: false,
          },
          {
            tag: "button",
            text: "Boka nu",
            href: null,
            disabled: false,
            ariaDisabled: false,
            ariaControls: null,
            ariaExpanded: null,
            type: "button",
            inForm: false,
            formAction: null,
            demoOnly: false,
          },
        ],
        forms: [],
      },
      { status: "not_applicable" },
    );

    expect(codes(evaluation)).toEqual(["cta_no_handler", "cta_no_handler"]);
    expect(evaluation.productBlocked).toBe(false);
  });

  it("reports fake forms", () => {
    const evaluation = evaluateProductDomSnapshot(
      {
        anchors: [],
        images: [],
        ctas: [],
        forms: [
          {
            id: "contact",
            action: null,
            method: null,
            hasSubmitControl: true,
            disabled: false,
            ariaDisabled: false,
            demoOnly: false,
            text: "Kontakta oss",
          },
        ],
      },
      { status: "not_applicable" },
    );

    expect(codes(evaluation)).toEqual(["fake_form"]);
    expect(evaluation.productBlocked).toBe(false);
  });

  it("reports mobile menu failure but ignores not_applicable", () => {
    const failed = evaluateProductDomSnapshot(
      { anchors: [], images: [], ctas: [], forms: [] },
      { status: "failed", reason: "hamburger_button_did_not_change_dom_or_aria" },
    );
    const skipped = evaluateProductDomSnapshot(
      { anchors: [], images: [], ctas: [], forms: [] },
      { status: "not_applicable" },
    );

    expect(codes(failed)).toEqual(["mobile_menu_failed"]);
    expect(failed.productBlocked).toBe(true);
    expect(skipped).toEqual({ warnings: [], productBlocked: false });
  });

  it("blocks when several internal anchors are broken", () => {
    const evaluation = evaluateProductDomSnapshot(
      {
        anchors: [
          { href: "#missing-a", text: "A", targetExists: false },
          { href: "#missing-b", text: "B", targetExists: false },
        ],
        images: [],
        ctas: [],
        forms: [],
      },
      { status: "not_applicable" },
    );

    expect(codes(evaluation)).toEqual(["broken_anchor", "broken_anchor"]);
    expect(evaluation.productBlocked).toBe(true);
  });
});

describe("productPostcheckSkipReasonFromError", () => {
  it("klassificerar Playwright/browser-fel som fail-open skip reasons", () => {
    expect(productPostcheckSkipReasonFromError(new Error("playwright is not installed"))).toBe(
      "playwright_unavailable",
    );
    expect(productPostcheckSkipReasonFromError(new Error("Timeout 30000ms exceeded"))).toBe("timeout");
    expect(productPostcheckSkipReasonFromError(new Error("page.goto: net::ERR_CONNECTION_REFUSED"))).toBe(
      "navigation_failed",
    );
    expect(productPostcheckSkipReasonFromError(new Error("unexpected"))).toBe("runtime_error");
  });

  // Prod 2026-08-08 (flugfiske-sajten): tre körningar i rad loggades som
  // `playwright_unavailable` fastän Playwright startade — felet kom från
  // navigeringen mot Fly-previewen och nämner bara ordet "browser" i sin
  // egen text. Fel etikett = fel felsökning.
  it("klassificerar 'Target page, context or browser has been closed' som navigation_failed", () => {
    const err = new Error(
      "page.goto: Target page, context or browser has been closed\n" +
        "Call log:\n" +
        '  - navigating to "https://vm-fly-jakem.fly.dev/chat_1", waiting until "domcontentloaded"',
    );
    expect(productPostcheckSkipReasonFromError(err)).toBe("navigation_failed");
  });

  it("behåller playwright_unavailable för äkta launch-fel", () => {
    expect(
      productPostcheckSkipReasonFromError(
        new Error("browserType.launch: Executable doesn't exist at /ms-playwright/chromium/chrome"),
      ),
    ).toBe("playwright_unavailable");
    expect(
      productPostcheckSkipReasonFromError(new Error("Failed to launch the browser process")),
    ).toBe("playwright_unavailable");
  });
});

describe("isRenderFatalError", () => {
  it("matches React-tree-fatal crashes (white screen)", () => {
    expect(
      isRenderFatalError(
        "Error: Element type is invalid: expected a string ... but got: object",
      ),
    ).toBe(true);
    expect(isRenderFatalError("Minified React error #130")).toBe(true);
    expect(isRenderFatalError("Objects are not valid as a React child (found: object)")).toBe(true);
    expect(isRenderFatalError("Rendered fewer hooks than expected")).toBe(true);
  });

  it("does not match ambiguous/benign throws (no over-blocking)", () => {
    expect(isRenderFatalError("")).toBe(false);
    // Generic JS throws are intentionally NOT treated as render-fatal here —
    // they can be non-fatal/third-party. Catching that class safely needs a
    // robust render-health signal (tracked follow-up).
    expect(isRenderFatalError("TypeError: item.icon is not a function")).toBe(false);
    expect(
      isRenderFatalError("TypeError: Cannot read properties of undefined (reading 'map')"),
    ).toBe(false);
    expect(isRenderFatalError("Failed to load resource: 404")).toBe(false);
  });
});

describe("isPreviewHostBootPage", () => {
  it("detects the preview-host starting / recovering placeholder", () => {
    expect(
      isPreviewHostBootPage({
        title: "Startar preview",
        h1: "Startar preview",
        bodyText: "Preview-host bygger projektet och startar Next.js i bakgrunden.",
      }),
    ).toBe(true);
    expect(
      isPreviewHostBootPage({
        title: "Startar om preview",
        h1: "Startar om preview",
        bodyText: "Preview-runtimen startar om i bakgrunden. Sidan laddar om automatiskt.",
      }),
    ).toBe(true);
    expect(
      isPreviewHostBootPage({
        title: "Preview kunde inte starta",
        h1: "Preview kunde inte starta",
        bodyText: "Uppstarten misslyckades.",
      }),
    ).toBe(true);
  });

  it("detects Status: warm_project on the placeholder body", () => {
    expect(
      isPreviewHostBootPage({
        title: "Startar preview",
        h1: "Startar preview",
        bodyText:
          "Preview-host bygger projektet.\nChat: 8aeac552\nStatus: warm_project",
      }),
    ).toBe(true);
  });

  it("does not treat a real site heading as a boot page", () => {
    expect(
      isPreviewHostBootPage({
        title: "Jakob & Johan Stays",
        h1: "Exklusiva semesterbostäder",
        bodyText: "Handplockade premiumboenden i Palma.",
      }),
    ).toBe(false);
    expect(isPreviewHostBootPage({ title: "", h1: null, bodyText: "" })).toBe(false);
    expect(
      isPreviewHostBootPage({
        title: "Home",
        h1: null,
        bodyText: "",
      }),
    ).toBe(false);
  });
});

describe("evaluateRuntimeErrors (M#f2et — never green when the preview is dead)", () => {
  const elementTypeInvalid =
    "Error: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object. Check the render method of `IconMark`.";

  it("blocks on a render-fatal React crash (white screen)", () => {
    const result = evaluateRuntimeErrors([elementTypeInvalid]);
    expect(result.productBlocked).toBe(true);
    expect(codes(result)).toEqual(["runtime_crash"]);
  });

  it("does NOT block on benign / ambiguous uncaught errors when the page still rendered (F2 stays fast)", () => {
    const result = evaluateRuntimeErrors([
      "Failed to load resource: the server responded with 404",
      "TypeError: Cannot read properties of undefined (reading 'map')",
    ]);
    expect(result.productBlocked).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("blocks when the Next.js error overlay is present, even for an ambiguous render crash (Codex #321 P1)", () => {
    // "Cannot read properties of undefined" during render is ambiguous on its
    // own, but if Next shows its error overlay the preview is dead → block.
    const result = evaluateRuntimeErrors(
      ["TypeError: Cannot read properties of undefined (reading 'map')"],
      { nextErrorOverlay: true },
    );
    expect(result.productBlocked).toBe(true);
    expect(codes(result)).toEqual(["runtime_crash"]);
  });

  it("blocks on the Next.js error overlay even with no captured pageerror", () => {
    const result = evaluateRuntimeErrors([], { nextErrorOverlay: true });
    expect(result.productBlocked).toBe(true);
    expect(codes(result)).toEqual(["runtime_crash"]);
  });

  it("returns a clean result when there were no runtime errors and no overlay", () => {
    expect(evaluateRuntimeErrors([])).toEqual({ warnings: [], productBlocked: false });
    expect(evaluateRuntimeErrors([], { nextErrorOverlay: false })).toEqual({
      warnings: [],
      productBlocked: false,
    });
  });

  it("dedupes repeated render-fatal messages and still blocks", () => {
    const result = evaluateRuntimeErrors([elementTypeInvalid, elementTypeInvalid, elementTypeInvalid]);
    expect(result.productBlocked).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });
});

/**
 * Postchecken importerade tidigare `playwright` rakt av. Den är en
 * devDependency vars Chromium aldrig installeras på Vercel, så launchen kastade
 * i prod → `playwright_unavailable` → `skipped: true, productBlocked: false`.
 * Kontrollen rapporterade alltså tyst grönt utan att någonsin ha kört. Samma
 * fälla som `@/lib/capture/browser` skapades för att stänga för miniatyrer och
 * inspector-capture; detta test låser att postchecken använder den startpunkten.
 */
describe("runProductPostcheck browser-startpunkt", () => {
  function fakePage(results: unknown[]) {
    let call = 0;
    return {
      on: vi.fn(),
      goto: vi.fn(async () => {}),
      reload: vi.fn(async () => {}),
      waitForLoadState: vi.fn(async () => {}),
      waitForTimeout: vi.fn(async (_delayMs?: number) => {}),
      evaluate: vi.fn(async () => results[call++]),
      close: vi.fn(async () => {}),
    };
  }

  const previewSession = {
    previewSessionId: "ps_1",
    previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
    versionId: "v1",
    filesRevision: null,
    createdAt: 1,
    lastUsedAt: 1,
  };

  function readinessVerdict(
    state: "starting" | "ready" | "failed",
    overrides: { httpReady?: boolean | null; running?: boolean } = {},
  ): {
    running: boolean;
    versionId: string;
    readinessState: "starting" | "ready" | "failed";
    httpReady: boolean | null;
    readinessError: string | null;
    regeneratedLockfile: null;
  } {
    return {
      running: overrides.running ?? state !== "failed",
      versionId: "v1",
      readinessState: state,
      httpReady: overrides.httpReady === undefined ? state === "ready" : overrides.httpReady,
      readinessError: null,
      regeneratedLockfile: null,
    };
  }

  const bootPageProbe = {
    title: "Startar preview",
    h1: "Startar preview",
    bodyText: "Preview-host bygger projektet och startar Next.js i bakgrunden.",
  };

  const liveBootProbe = {
    title: "Jakob & Johan Stays",
    h1: "Exklusiva semesterbostäder",
    bodyText: "Handplockade premiumboenden i Palma.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    isLiveReviewEnabledMock.mockReturnValue(false);
    getActivePreviewSessionAsyncMock.mockResolvedValue(null);
    fetchPreviewHostReadinessVerdictMock.mockResolvedValue(null);
    applyCaptureRequestGateMock.mockResolvedValue(undefined);
    const desktop = fakePage([
      liveBootProbe,
      { anchors: [], images: [], ctas: [], forms: [] },
      false,
    ]);
    const mobile = fakePage([{ status: "not_applicable" }, false]);
    const pages = [desktop, mobile];
    let index = 0;
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => pages[index++]),
      close: vi.fn(async () => {}),
    });
  });

  it("startar Chromium via den delade, prod-dugliga startpunkten", async () => {
    const result = await runProductPostcheck({
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      chatId: "chat_1",
      versionId: "v1",
    });

    expect(launchCaptureBrowserMock).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(false);
    expect(result.skippedReason).toBeNull();
  });

  it("lägger SSRF-grinden på båda viewporterna", async () => {
    await runProductPostcheck({
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      chatId: "chat_1",
      versionId: "v1",
    });

    expect(applyCaptureRequestGateMock).toHaveBeenCalledTimes(2);
  });

  it("sätter inte productBlocked när hosten inte är redo och sidan är boot-placeholder", async () => {
    let nowMs = 1_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    getActivePreviewSessionAsyncMock.mockResolvedValue(previewSession);
    fetchPreviewHostReadinessVerdictMock.mockResolvedValue(readinessVerdict("starting"));
    const desktop = fakePage(Array.from({ length: 20 }, () => bootPageProbe));
    desktop.waitForTimeout.mockImplementation(async () => {
      nowMs = 40_000;
    });
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => desktop),
      close: vi.fn(async () => {}),
    });

    try {
      const result = await runProductPostcheck({
        previewUrl: "http://127.0.0.1:3000/chat_1",
        chatId: "chat_1",
        versionId: "v1",
      });

      expect(result.productBlocked).toBe(false);
      expect(result.skipped).toBe(false);
      expect(result.warnings.map((w) => w.code)).toEqual(["preview_boot_page"]);
      expect(desktop.reload).not.toHaveBeenCalled();
    } finally {
      dateNow.mockRestore();
    }
  });

  it("blockerar med preview_boot_page när hosten är redo men sidan är fortfarande boot-placeholder", async () => {
    getActivePreviewSessionAsyncMock.mockResolvedValue(previewSession);
    fetchPreviewHostReadinessVerdictMock.mockResolvedValue(readinessVerdict("ready"));
    const desktop = fakePage([bootPageProbe, bootPageProbe]);
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => desktop),
      close: vi.fn(async () => {}),
    });

    const result = await runProductPostcheck({
      previewUrl: "http://127.0.0.1:3000/chat_1",
      chatId: "chat_1",
      versionId: "v1",
    });

    expect(result.productBlocked).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.warnings.map((w) => w.code)).toEqual(["preview_boot_page"]);
    expect(result.warnings[0]?.message).toContain("Preview-host");
    expect(desktop.reload).toHaveBeenCalled();
    expect(applyCaptureRequestGateMock).toHaveBeenCalledTimes(1);
  });

  it("blockerar med preview_boot_page när hosten är failed och sidan är boot-placeholder", async () => {
    getActivePreviewSessionAsyncMock.mockResolvedValue(previewSession);
    fetchPreviewHostReadinessVerdictMock.mockResolvedValue(readinessVerdict("failed"));
    const desktop = fakePage([bootPageProbe, bootPageProbe]);
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => desktop),
      close: vi.fn(async () => {}),
    });

    const result = await runProductPostcheck({
      previewUrl: "http://127.0.0.1:3000/chat_1",
      chatId: "chat_1",
      versionId: "v1",
    });

    expect(result.productBlocked).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.warnings.map((w) => w.code)).toEqual(["preview_boot_page"]);
    expect(desktop.reload).not.toHaveBeenCalled();
  });

  it("klassar tomt/misslyckat svar som preview_probe_unreadable utan att skylla på preview-hosten", async () => {
    let nowMs = 1_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    getActivePreviewSessionAsyncMock.mockResolvedValue(previewSession);
    fetchPreviewHostReadinessVerdictMock.mockResolvedValue(readinessVerdict("starting"));
    const emptyProbe = { title: "", h1: null, bodyText: "" };
    const desktop = fakePage(Array.from({ length: 20 }, () => emptyProbe));
    desktop.waitForTimeout.mockImplementation(async () => {
      nowMs = 40_000;
    });
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => desktop),
      close: vi.fn(async () => {}),
    });

    try {
      const result = await runProductPostcheck({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        chatId: "chat_1",
        versionId: "v1",
      });

      expect(result.productBlocked).toBe(false);
      expect(result.skipped).toBe(false);
      expect(result.warnings.map((w) => w.code)).toEqual(["preview_probe_unreadable"]);
      expect(result.warnings[0]?.message).not.toMatch(
        /preview-host|Preview-host|startsidan|Startar preview|Fly/i,
      );
    } finally {
      dateNow.mockRestore();
    }
  });

  it("blockerar inte när runtimen blir klar efter den gamla 20s-budgeten om readiness säger ready", async () => {
    let nowMs = 1_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    getActivePreviewSessionAsyncMock.mockResolvedValue(previewSession);
    fetchPreviewHostReadinessVerdictMock
      .mockResolvedValueOnce(readinessVerdict("starting"))
      .mockResolvedValue(readinessVerdict("ready"));
    const desktop = fakePage([
      bootPageProbe,
      liveBootProbe,
      { anchors: [], images: [], ctas: [], forms: [] },
      false,
    ]);
    desktop.waitForTimeout.mockImplementation(async (delayMs?: number) => {
      nowMs += delayMs ?? 0;
      if (nowMs < 22_000) nowMs = 22_000;
    });
    const mobile = fakePage([{ status: "not_applicable" }, false]);
    const pages = [desktop, mobile];
    let index = 0;
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => pages[index++]),
      close: vi.fn(async () => {}),
    });

    try {
      const result = await runProductPostcheck({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        chatId: "chat_1",
        versionId: "v1",
      });

      expect(nowMs).toBeGreaterThanOrEqual(22_000);
      expect(result.productBlocked).toBe(false);
      expect(result.skipped).toBe(false);
      expect(result.warnings.map((w) => w.code)).not.toContain("preview_boot_page");
      expect(desktop.reload).toHaveBeenCalled();
    } finally {
      dateNow.mockRestore();
    }
  });

  it("klassar inte httpReady:false som redo bara för att readinessState är ready", async () => {
    let nowMs = 1_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    getActivePreviewSessionAsyncMock.mockResolvedValue(previewSession);
    fetchPreviewHostReadinessVerdictMock.mockResolvedValue(
      readinessVerdict("ready", { httpReady: false, running: false }),
    );
    const desktop = fakePage([bootPageProbe, bootPageProbe]);
    desktop.waitForTimeout.mockImplementation(async () => {
      nowMs = 40_000;
    });
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => desktop),
      close: vi.fn(async () => {}),
    });

    try {
      const result = await runProductPostcheck({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        chatId: "chat_1",
        versionId: "v1",
      });

      expect(result.productBlocked).toBe(false);
      expect(result.warnings.map((w) => w.code)).toEqual(["preview_boot_page"]);
      expect(desktop.reload).not.toHaveBeenCalled();
    } finally {
      dateNow.mockRestore();
    }
  });

  it("läser om sidan efter readiness-poll så en boot-placeholder under väntan påverkar beslutet", async () => {
    let nowMs = 1_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    getActivePreviewSessionAsyncMock.mockResolvedValue(previewSession);
    fetchPreviewHostReadinessVerdictMock.mockResolvedValue(readinessVerdict("starting"));
    const emptyProbe = { title: "", h1: null, bodyText: "" };
    const desktop = fakePage([emptyProbe, bootPageProbe]);
    desktop.waitForTimeout.mockImplementation(async () => {
      nowMs = 40_000;
    });
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => desktop),
      close: vi.fn(async () => {}),
    });

    try {
      const result = await runProductPostcheck({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        chatId: "chat_1",
        versionId: "v1",
      });

      expect(result.productBlocked).toBe(false);
      expect(result.warnings.map((w) => w.code)).toEqual(["preview_boot_page"]);
      expect(desktop.evaluate).toHaveBeenCalledTimes(2);
      expect(desktop.reload).not.toHaveBeenCalled();
    } finally {
      dateNow.mockRestore();
    }
  });

  it("försöker igen när första /status-hämtningen misslyckas och tar det lyckade ready-verdiktet", async () => {
    let nowMs = 1_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    getActivePreviewSessionAsyncMock.mockResolvedValue(previewSession);
    fetchPreviewHostReadinessVerdictMock
      .mockResolvedValueOnce(null)
      .mockResolvedValue(readinessVerdict("ready"));
    const desktop = fakePage([
      bootPageProbe,
      liveBootProbe,
      { anchors: [], images: [], ctas: [], forms: [] },
      false,
    ]);
    desktop.waitForTimeout.mockImplementation(async (delayMs?: number) => {
      nowMs += delayMs ?? 0;
    });
    const mobile = fakePage([{ status: "not_applicable" }, false]);
    const pages = [desktop, mobile];
    let index = 0;
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => pages[index++]),
      close: vi.fn(async () => {}),
    });

    try {
      const result = await runProductPostcheck({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        chatId: "chat_1",
        versionId: "v1",
      });

      expect(fetchPreviewHostReadinessVerdictMock).toHaveBeenCalledTimes(2);
      expect(result.productBlocked).toBe(false);
      expect(result.skipped).toBe(false);
      expect(result.warnings.map((w) => w.code)).not.toContain("preview_probe_unreadable");
      expect(desktop.reload).toHaveBeenCalled();
    } finally {
      dateNow.mockRestore();
    }
  });

  it("faller tillbaka på HTML-poll som preview_probe_unreadable när /status misslyckas hela vägen till deadline", async () => {
    let nowMs = 1_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    getActivePreviewSessionAsyncMock.mockResolvedValue(previewSession);
    fetchPreviewHostReadinessVerdictMock.mockResolvedValue(null);
    const desktop = fakePage([bootPageProbe, bootPageProbe]);
    desktop.waitForTimeout.mockImplementation(async () => {
      nowMs = 40_000;
    });
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => desktop),
      close: vi.fn(async () => {}),
    });

    try {
      const result = await runProductPostcheck({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        chatId: "chat_1",
        versionId: "v1",
      });

      expect(fetchPreviewHostReadinessVerdictMock).toHaveBeenCalled();
      expect(result.productBlocked).toBe(false);
      expect(result.warnings.map((w) => w.code)).toEqual(["preview_probe_unreadable"]);
      expect(result.warnings[0]?.message).not.toMatch(
        /preview-host|Preview-host|startsidan|Startar preview|Fly/i,
      );
    } finally {
      dateNow.mockRestore();
    }
  });

  it("skyller inte på preview-hosten när readiness saknas och HTML-poll lämnar en startsida", async () => {
    const desktop = fakePage(Array.from({ length: 20 }, () => bootPageProbe));
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => desktop),
      close: vi.fn(async () => {}),
    });

    const result = await runProductPostcheck({
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      chatId: "chat_1",
      versionId: "v1",
    });

    expect(result.productBlocked).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.warnings.map((w) => w.code)).toEqual(["preview_probe_unreadable"]);
    expect(result.warnings[0]?.message).not.toMatch(
      /preview-host|Preview-host|startsidan|Startar preview|Fly/i,
    );
    expect(applyCaptureRequestGateMock).toHaveBeenCalledTimes(1);
  });

  it("väntar igenom en övergående boot-sida innan produktkontrollen fortsätter", async () => {
    const desktop = fakePage([
      bootPageProbe,
      liveBootProbe,
      { anchors: [], images: [], ctas: [], forms: [] },
      false,
    ]);
    const mobile = fakePage([{ status: "not_applicable" }, false]);
    const pages = [desktop, mobile];
    let index = 0;
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => pages[index++]),
      close: vi.fn(async () => {}),
    });

    const result = await runProductPostcheck({
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      chatId: "chat_1",
      versionId: "v1",
    });

    expect(result.productBlocked).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.warnings.map((w) => w.code)).not.toContain("preview_boot_page");
    expect(applyCaptureRequestGateMock).toHaveBeenCalledTimes(2);
  });

  it("börjar boot-retryn vid första probe även efter långsam navigation", async () => {
    let nowMs = 1_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    const desktop = fakePage([
      bootPageProbe,
      liveBootProbe,
      { anchors: [], images: [], ctas: [], forms: [] },
      false,
    ]);
    desktop.goto.mockImplementation(async () => {
      nowMs += 20_000;
    });
    desktop.waitForTimeout.mockImplementation(async (delayMs?: number) => {
      nowMs += delayMs ?? 0;
    });
    const mobile = fakePage([{ status: "not_applicable" }, false]);
    const pages = [desktop, mobile];
    let index = 0;
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => pages[index++]),
      close: vi.fn(async () => {}),
    });

    try {
      const result = await runProductPostcheck({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        chatId: "chat_1",
        versionId: "v1",
      });

      expect(result.productBlocked).toBe(false);
      expect(result.warnings.map((w) => w.code)).not.toContain("preview_boot_page");
    } finally {
      dateNow.mockRestore();
    }
  });

  it("fortsätter polla när första evaluate misslyckas (null) innan boot syns", async () => {
    const desktop = fakePage([
      null, // meta-refresh / transient evaluate failure — must not fail-open
      bootPageProbe,
      liveBootProbe,
      { anchors: [], images: [], ctas: [], forms: [] },
      false,
    ]);
    const mobile = fakePage([{ status: "not_applicable" }, false]);
    const pages = [desktop, mobile];
    let index = 0;
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => pages[index++]),
      close: vi.fn(async () => {}),
    });

    const result = await runProductPostcheck({
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      chatId: "chat_1",
      versionId: "v1",
    });

    expect(desktop.waitForTimeout).toHaveBeenCalled();
    expect(result.productBlocked).toBe(false);
    expect(result.warnings.map((w) => w.code)).not.toContain("preview_boot_page");
  });

  it("klassar evaluate-miss som preview_probe_unreadable, inte preview_boot_page", async () => {
    let nowMs = 1_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    const desktop = fakePage(Array.from({ length: 20 }, () => null));
    desktop.waitForTimeout.mockImplementation(async (delayMs?: number) => {
      nowMs += delayMs ?? 0;
    });
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => desktop),
      close: vi.fn(async () => {}),
    });

    try {
      const result = await runProductPostcheck({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        chatId: "chat_1",
        versionId: "v1",
      });

      expect(result.productBlocked).toBe(false);
      expect(result.warnings.map((w) => w.code)).toEqual(["preview_probe_unreadable"]);
      expect(result.warnings[0]?.message).not.toMatch(
        /preview-host|Preview-host|startsidan|Startar preview|Fly/i,
      );
      expect(desktop.waitForTimeout).toHaveBeenCalled();
    } finally {
      dateNow.mockRestore();
    }
  });

  it("väntar igenom titled-but-empty body (partiell Next-kompilering)", async () => {
    const titledEmpty = { title: "Home", h1: null, bodyText: "" };
    const desktop = fakePage([
      titledEmpty,
      liveBootProbe,
      { anchors: [], images: [], ctas: [], forms: [] },
      false,
    ]);
    const mobile = fakePage([{ status: "not_applicable" }, false]);
    const pages = [desktop, mobile];
    let index = 0;
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => pages[index++]),
      close: vi.fn(async () => {}),
    });

    const result = await runProductPostcheck({
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      chatId: "chat_1",
      versionId: "v1",
    });

    expect(result.productBlocked).toBe(false);
    expect(result.warnings.map((w) => w.code)).not.toContain("preview_boot_page");
  });

  it("klassar titled-but-empty vid deadline som oläsbart, inte startsida", async () => {
    let nowMs = 1_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    const titledEmpty = { title: "Home", h1: null, bodyText: "" };
    const desktop = fakePage(Array.from({ length: 20 }, () => titledEmpty));
    desktop.waitForTimeout.mockImplementation(async (delayMs?: number) => {
      nowMs += delayMs ?? 0;
    });
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => desktop),
      close: vi.fn(async () => {}),
    });

    try {
      const result = await runProductPostcheck({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        chatId: "chat_1",
        versionId: "v1",
      });

      expect(result.productBlocked).toBe(false);
      expect(result.warnings.map((w) => w.code)).toEqual(["preview_probe_unreadable"]);
      expect(
        isPreviewHostBootPage({ title: "Home", h1: null, bodyText: "" }),
      ).toBe(false);
    } finally {
      dateNow.mockRestore();
    }
  });

  it("rapporterar en kraschad undersida utan att blockera versionen", async () => {
    const desktop = fakePage([
      liveBootProbe,
      { anchors: [], images: [], ctas: [], forms: [] },
      false, // startsidans overlay — previewen lever
      ["/chat_1/om-oss"], // länkar att crawla
      true, // undersidans overlay — kraschad
    ]);
    const mobile = fakePage([{ status: "not_applicable" }, false]);
    const pages = [desktop, mobile];
    let index = 0;
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => pages[index++]),
      close: vi.fn(async () => {}),
    });

    const result = await runProductPostcheck({
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      chatId: "chat_1",
      versionId: "v1",
    });

    // Startsidan lever → versionen får inte blockeras av en undersida.
    expect(result.productBlocked).toBe(false);
    expect(result.routesChecked).toBe(2);
    expect(result.warnings.some((w) => w.route === "/chat_1/om-oss")).toBe(true);
  });

  /**
   * Crawlen navigerar bort desktop-sidan från startsidan. `catch`-blockets
   * overlay-omprövning får därför inte längre lita på att `page` beskriver
   * startsidan — annars kan en död startsida läsas som grön, och en kraschad
   * undersida kan blockera fast happy-pathen bara varnar för den.
   */
  describe("overlay-omprövning efter att crawlen flyttat desktop-sidan", () => {
    function browserWhereMobileFails(desktopResults: unknown[]) {
      const desktop = fakePage(desktopResults);
      let call = 0;
      return {
        newPage: vi.fn(async () => {
          call += 1;
          if (call === 1) return desktop;
          throw new Error("mobile viewport failed");
        }),
        close: vi.fn(async () => {}),
      };
    }

    it("blockerar fortfarande när STARTSIDAN var död", async () => {
      launchCaptureBrowserMock.mockResolvedValue(
        browserWhereMobileFails([
          liveBootProbe,
          { anchors: [], images: [], ctas: [], forms: [] },
          true, // startsidan visade felöverlägget
          ["/chat_1/om-oss"],
          false,
        ]),
      );

      const result = await runProductPostcheck({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        chatId: "chat_1",
        versionId: "v1",
      });

      expect(result.productBlocked).toBe(true);
      expect(result.skipped).toBe(false);
    });

    it("blockerar inte när bara en UNDERSIDA var död", async () => {
      launchCaptureBrowserMock.mockResolvedValue(
        browserWhereMobileFails([
          liveBootProbe,
          { anchors: [], images: [], ctas: [], forms: [] },
          false, // startsidan var frisk
          ["/chat_1/om-oss"],
          true, // undersidan kraschade
        ]),
      );

      const result = await runProductPostcheck({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        chatId: "chat_1",
        versionId: "v1",
      });

      expect(result.productBlocked).toBe(false);
    });
  });
});

describe("runProductPostcheck screenshot best-effort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isLiveReviewEnabledMock.mockReturnValue(true);
    persistLiveReviewJpegMock.mockResolvedValue("https://blob.example/live-review.jpg");
    getActivePreviewSessionAsyncMock.mockResolvedValue(null);
    fetchPreviewHostReadinessVerdictMock.mockResolvedValue(null);
    applyCaptureRequestGateMock.mockResolvedValue(undefined);
  });

  function pageWithScreenshot(
    results: unknown[],
    screenshotImpl: () => Promise<Buffer>,
  ) {
    let call = 0;
    return {
      on: vi.fn(),
      goto: vi.fn(async () => {}),
      reload: vi.fn(async () => {}),
      waitForLoadState: vi.fn(async () => {}),
      waitForTimeout: vi.fn(async () => {}),
      evaluate: vi.fn(async () => results[call++]),
      screenshot: vi.fn(screenshotImpl),
      close: vi.fn(async () => {}),
    };
  }

  it("en misslyckad bild fäller inte postchecken och blir inte ett fynd", async () => {
    const desktop = pageWithScreenshot(
      [
        { title: "Jakob & Johan Stays", h1: "Hero", bodyText: "Handplockade." },
        { anchors: [], images: [], ctas: [], forms: [] },
        false,
        [],
        { title: "Jakob & Johan Stays", h1: "Hero", bodyText: "Handplockade." },
      ],
      async () => {
        throw new Error("page.screenshot: Target page, context or browser has been closed");
      },
    );
    const mobile = pageWithScreenshot([{ status: "not_applicable" }, false], async () => {
      throw new Error("screenshot failed");
    });
    const pages = [desktop, mobile];
    let index = 0;
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => pages[index++]),
      close: vi.fn(async () => {}),
    });

    const result = await runProductPostcheck({
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      chatId: "chat_1",
      versionId: "v1",
      captureEnabled: true,
    });

    expect(result.skipped).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).not.toContain("console_error");
    expect(result.warnings.some((warning) => /screenshot|skärmbild/i.test(warning.message))).toBe(
      false,
    );
    expect(persistLiveReviewJpegMock).not.toHaveBeenCalled();
    expect(result.screenshots).toBeNull();
  });

  it("persisterar desktop- och mobil-JPEG när skotten lyckas", async () => {
    persistLiveReviewJpegMock
      .mockResolvedValueOnce("https://blob.example/desktop.jpg")
      .mockResolvedValueOnce("https://blob.example/mobile.jpg");
    const desktop = pageWithScreenshot(
      [
        { title: "Jakob & Johan Stays", h1: "Hero", bodyText: "Handplockade." },
        { anchors: [], images: [], ctas: [], forms: [] },
        false,
        [],
        { title: "Jakob & Johan Stays", h1: "Hero", bodyText: "Handplockade." },
      ],
      async () => Buffer.from("desk"),
    );
    const mobile = pageWithScreenshot([{ status: "not_applicable" }, false], async () =>
      Buffer.from("mob"),
    );
    const pages = [desktop, mobile];
    let index = 0;
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => pages[index++]),
      close: vi.fn(async () => {}),
    });

    const result = await runProductPostcheck({
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      chatId: "chat_1",
      versionId: "v1",
      captureEnabled: true,
    });

    expect(result.skipped).toBe(false);
    expect(persistLiveReviewJpegMock).toHaveBeenCalledTimes(2);
    expect(result.screenshots).toEqual({
      desktopUrl: "https://blob.example/desktop.jpg",
      mobileUrl: "https://blob.example/mobile.jpg",
    });
  });

  it("env-flaggan ensam räcker inte för capture", async () => {
    isLiveReviewEnabledMock.mockReturnValue(true);
    const desktop = pageWithScreenshot(
      [
        { title: "Jakob & Johan Stays", h1: "Hero", bodyText: "Handplockade." },
        { anchors: [], images: [], ctas: [], forms: [] },
        false,
        [],
        { title: "Jakob & Johan Stays", h1: "Hero", bodyText: "Handplockade." },
      ],
      async () => Buffer.from("desk"),
    );
    const mobile = pageWithScreenshot([{ status: "not_applicable" }, false], async () =>
      Buffer.from("mob"),
    );
    const pages = [desktop, mobile];
    let index = 0;
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => pages[index++]),
      close: vi.fn(async () => {}),
    });

    const result = await runProductPostcheck({
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      chatId: "chat_1",
      versionId: "v1",
    });

    expect(persistLiveReviewJpegMock).not.toHaveBeenCalled();
    expect(result.screenshots).toBeNull();
  });

  it("förlänger crawl-deadlinen med exakt capture-tid", () => {
    expect(resolveCrawlDeadlineMs(CRAWL_DEADLINE_MS, 0)).toBe(CRAWL_DEADLINE_MS);
    expect(resolveCrawlDeadlineMs(CRAWL_DEADLINE_MS, 15_000)).toBe(CRAWL_DEADLINE_MS + 15_000);
    expect(resolveCrawlDeadlineMs(CRAWL_DEADLINE_MS, -4)).toBe(CRAWL_DEADLINE_MS);
  });

  it("låter crawlen fortsätta efter ett långsamt desktop-skott", async () => {
    let nowMs = 0;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    const desktop = pageWithScreenshot(
      [
        { title: "Jakob & Johan Stays", h1: "Hero", bodyText: "Handplockade." },
        { anchors: [], images: [], ctas: [], forms: [] },
        false,
        { title: "Jakob & Johan Stays", h1: "Hero", bodyText: "Handplockade." },
        ["/chat_1/om-oss"],
        false,
      ],
      async () => {
        nowMs += CRAWL_DEADLINE_MS + 1_000;
        return Buffer.from("desk");
      },
    );
    const mobile = pageWithScreenshot([{ status: "not_applicable" }, false], async () =>
      Buffer.from("mob"),
    );
    const pages = [desktop, mobile];
    let index = 0;
    launchCaptureBrowserMock.mockResolvedValue({
      newPage: vi.fn(async () => pages[index++]),
      close: vi.fn(async () => {}),
    });

    try {
      const result = await runProductPostcheck({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        chatId: "chat_1",
        versionId: "v1",
        captureEnabled: true,
      });
      expect(result.skipped).toBe(false);
      expect(result.routesChecked).toBe(2);
    } finally {
      dateNow.mockRestore();
    }
  });
});

/**
 * NFT tappar Chromium-binären för varje serverless-funktion som saknar egen
 * spårningspost, och funktionen dör då vid browser-launch med grönt bygge
 * (Codex P1 på #729). Enhetstester som mockar `executablePath` kan inte fånga
 * det — därför granskas konfigurationen direkt.
 */
describe("outputFileTracingIncludes för browser-routes", () => {
  const routesThatLaunchChromium = [
    "/api/projects/*/thumbnail",
    "/api/inspector-capture",
    "/api/engine/chats/*/product-postcheck",
  ];

  it("ger varje Chromium-route en egen spårningspost", () => {
    const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    for (const route of routesThatLaunchChromium) {
      expect(config).toContain(`"${route}"`);
    }
  });
});

describe("shouldIgnoreConsoleError", () => {
  it("ignorerar Next-dev / React-devtools-brus och tom text", () => {
    expect(shouldIgnoreConsoleError("")).toBe(true);
    expect(shouldIgnoreConsoleError("   ")).toBe(true);
    expect(shouldIgnoreConsoleError("Download the React DevTools for a better development experience")).toBe(true);
    expect(shouldIgnoreConsoleError("[Fast Refresh] rebuilding")).toBe(true);
    expect(shouldIgnoreConsoleError("[HMR] connected")).toBe(true);
    expect(shouldIgnoreConsoleError("webpack-hmr disconnected")).toBe(true);
    expect(shouldIgnoreConsoleError("WebSocket to /_next/hmr failed")).toBe(true);
    expect(shouldIgnoreConsoleError("turbopack-hmr disconnected")).toBe(true);
  });

  it("släpper igenom riktiga console-fel", () => {
    expect(shouldIgnoreConsoleError("TypeError: x is not a function")).toBe(false);
    expect(shouldIgnoreConsoleError("Failed to load resource")).toBe(false);
  });

  it("släpper igenom den härledda script-tag-varningen (den filtreras villkorat i evaluateBrowserRuntimeIssues)", () => {
    expect(
      shouldIgnoreConsoleError(
        "Encountered a script tag while rendering React component. Scripts cannot be rendered as React children.",
      ),
    ).toBe(false);
    expect(
      shouldIgnoreConsoleError("ENCOUNTERED A SCRIPT TAG WHILE RENDERING REACT COMPONENT"),
    ).toBe(false);
    expect(
      shouldIgnoreConsoleError(
        "Hydration failed because the server rendered HTML didn't match the client.",
      ),
    ).toBe(false);
  });
});

describe("shouldIgnoreFailedRequest", () => {
  it("ignorerar SSRF-grindens blockedbyclient och ERR_ABORTED", () => {
    expect(shouldIgnoreFailedRequest("https://evil.example/x", "blockedbyclient")).toBe(true);
    expect(shouldIgnoreFailedRequest("https://evil.example/x", "net::ERR_BLOCKED_BY_CLIENT")).toBe(true);
    expect(shouldIgnoreFailedRequest("https://cdn.example/a.js", "net::ERR_ABORTED")).toBe(true);
  });

  it("ignorerar HMR och source maps", () => {
    expect(shouldIgnoreFailedRequest("https://host/_next/webpack-hmr", "socket hang up")).toBe(true);
    expect(shouldIgnoreFailedRequest("https://host/app.js.map", "net::ERR_FAILED")).toBe(true);
  });

  // SM-062: Next 16.3 döpte om endpointen. En misslyckad HMR-handskakning är
  // brus — vanligt på Fly där edge-proxyn inte alltid klarar WS genom
  // chatId-prefixet — och får inte räknas som defekt i användarens sajt.
  it("ignorerar Next 16.3:s omdöpta HMR-sökväg och Turbopacks", () => {
    expect(shouldIgnoreFailedRequest("https://host/chat_1/_next/hmr?id=abc", "socket hang up")).toBe(
      true,
    );
    expect(shouldIgnoreFailedRequest("https://host/_next/turbopack-hmr", "net::ERR_FAILED")).toBe(
      true,
    );
  });

  it("låter en riktig rutt som bara innehåller hmr passera som fel", () => {
    expect(shouldIgnoreFailedRequest("https://host/hmr-dashboard", "net::ERR_FAILED")).toBe(false);
  });

  it("släpper igenom riktiga request-fel", () => {
    expect(shouldIgnoreFailedRequest("https://host/api/data", "net::ERR_FAILED")).toBe(false);
  });
});

describe("shouldIgnoreHttpStatus", () => {
  it("ignorerar favicon, maps, HMR och 4xx på /_next/", () => {
    expect(shouldIgnoreHttpStatus("https://host/favicon.ico", 404)).toBe(true);
    expect(shouldIgnoreHttpStatus("https://host/static/app.js.map", 404)).toBe(true);
    expect(shouldIgnoreHttpStatus("https://host/_next/webpack-hmr", 500)).toBe(true);
    expect(shouldIgnoreHttpStatus("https://host/_next/static/chunks/main.js", 404)).toBe(true);
  });

  it("ignorerar inte dokument-nivå 4xx/5xx eller 5xx utanför /_next/-4xx-regeln", () => {
    expect(shouldIgnoreHttpStatus("https://host/chat_1/about", 404)).toBe(false);
    expect(shouldIgnoreHttpStatus("https://host/chat_1", 500)).toBe(false);
    expect(shouldIgnoreHttpStatus("https://host/_next/static/chunks/main.js", 500)).toBe(false);
  });
});

describe("isHydrationConsoleError", () => {
  it("matchar React hydration-formuleringar", () => {
    expect(isHydrationConsoleError("Hydration failed because the initial UI does not match")).toBe(true);
    expect(isHydrationConsoleError("Error while hydrating")).toBe(true);
    expect(isHydrationConsoleError("A tree hydrated but some attributes of the server rendered HTML didn't match")).toBe(true);
    expect(isHydrationConsoleError("Text content did not match. Server: \"A\" Client: \"B\"")).toBe(true);
    expect(isHydrationConsoleError("Text content does not match server-rendered HTML")).toBe(true);
    expect(isHydrationConsoleError("Didn't match the client")).toBe(true);
    expect(isHydrationConsoleError("server-rendered HTML")).toBe(true);
  });

  it("matchar inte bare 'mismatch' eller orelaterade fel", () => {
    expect(isHydrationConsoleError("Type mismatch in props")).toBe(false);
    expect(isHydrationConsoleError("schema mismatch")).toBe(false);
    expect(isHydrationConsoleError("TypeError: x is not a function")).toBe(false);
  });
});

describe("evaluateBrowserRuntimeIssues (advisory-only)", () => {
  it("klassificerar hydration vs console vs request vs http och blockar aldrig", () => {
    const issues: BrowserRuntimeIssue[] = [
      { kind: "console", route: "/chat_1", message: "Hydration failed because UI mismatch" },
      { kind: "console", route: "/chat_1", message: "TypeError: boom" },
      {
        kind: "requestfailed",
        route: "/chat_1",
        message: "GET https://host/api/x: net::ERR_FAILED",
        url: "https://host/api/x",
      },
      {
        kind: "http",
        route: "/chat_1/about",
        message: "404 https://host/chat_1/about",
        url: "https://host/chat_1/about",
        status: 404,
      },
    ];
    const result = evaluateBrowserRuntimeIssues(issues);
    expect(result.productBlocked).toBe(false);
    expect(codes(result)).toEqual([
      "console_error",
      "http_error",
      "hydration_mismatch",
      "request_failed",
    ]);
    expect(result.warnings.every((w) => w.route)).toBe(true);
  });

  it("filtrerar brus och cappar till 3 per kod", () => {
    const issues: BrowserRuntimeIssue[] = [
      { kind: "console", route: "/", message: "Download the React DevTools" },
      {
        kind: "requestfailed",
        route: "/",
        message: "GET https://evil/x: blockedbyclient",
        url: "https://evil/x",
      },
      {
        kind: "http",
        route: "/",
        message: "404 https://host/favicon.ico",
        url: "https://host/favicon.ico",
        status: 404,
      },
      ...Array.from({ length: 5 }, (_, i) => ({
        kind: "console" as const,
        route: "/",
        message: `Real error ${i}`,
      })),
    ];
    const result = evaluateBrowserRuntimeIssues(issues);
    expect(result.productBlocked).toBe(false);
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings.every((w) => w.code === "console_error")).toBe(true);
  });

  it("dedupar på code|route|message", () => {
    const issues: BrowserRuntimeIssue[] = [
      { kind: "console", route: "/a", message: "same" },
      { kind: "console", route: "/a", message: "same" },
      { kind: "console", route: "/b", message: "same" },
    ];
    const result = evaluateBrowserRuntimeIssues(issues);
    expect(result.warnings).toHaveLength(2);
  });

  it("släpper script-tag-varningen när ett hydreringsfel finns på samma route", () => {
    const result = evaluateBrowserRuntimeIssues([
      {
        kind: "console",
        route: "/",
        message:
          "Encountered a script tag while rendering React component. Scripts cannot be rendered as React children.",
      },
      {
        kind: "console",
        route: "/",
        message:
          "Hydration failed because the server rendered HTML didn't match the client.",
      },
      { kind: "console", route: "/", message: "TypeError: boom" },
    ]);
    expect(codes(result)).toEqual(["console_error", "hydration_mismatch"]);
    expect(result.warnings.some((w) => /script tag/i.test(w.message))).toBe(false);
    expect(result.warnings.some((w) => w.message.includes("TypeError: boom"))).toBe(true);
  });

  it("behåller script-tag-varningen på en route utan hydreringskrock", () => {
    const result = evaluateBrowserRuntimeIssues([
      {
        kind: "console",
        route: "/",
        message:
          "Hydration failed because the server rendered HTML didn't match the client.",
      },
      {
        kind: "console",
        route: "/",
        message:
          "Encountered a script tag while rendering React component. Scripts cannot be rendered as React children.",
      },
      {
        kind: "console",
        route: "/kontakt",
        message:
          "Encountered a script tag while rendering React component. Scripts cannot be rendered as React children.",
      },
    ]);
    expect(result.productBlocked).toBe(false);
    expect(codes(result)).toEqual(["console_error", "hydration_mismatch"]);
    const scriptWarnings = result.warnings.filter((w) => /script tag/i.test(w.message));
    expect(scriptWarnings).toHaveLength(1);
    expect(scriptWarnings[0]!.code).toBe("console_error");
    expect(scriptWarnings[0]!.route).toBe("/kontakt");
    expect(
      result.warnings.some((w) => w.route === "/" && /script tag/i.test(w.message)),
    ).toBe(false);
  });

  it("behåller script-tag-varningen när den är enda console-defekten", () => {
    const result = evaluateBrowserRuntimeIssues([
      {
        kind: "console",
        route: "/",
        message: "Encountered a script tag while rendering React component",
      },
    ]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.code).toBe("console_error");
    expect(result.warnings[0]!.message).toMatch(/script tag/i);
  });

  it("låter övriga ignore-mönster vara opåverkade", () => {
    const withHydration = evaluateBrowserRuntimeIssues([
      { kind: "console", route: "/", message: "Hydration failed because UI mismatch" },
      { kind: "console", route: "/", message: "Download the React DevTools for a better development experience" },
      { kind: "console", route: "/", message: "[Fast Refresh] rebuilding" },
      { kind: "console", route: "/", message: "[HMR] connected" },
      { kind: "console", route: "/", message: "webpack-hmr disconnected" },
    ]);
    expect(codes(withHydration)).toEqual(["hydration_mismatch"]);

    const withoutHydration = evaluateBrowserRuntimeIssues([
      { kind: "console", route: "/", message: "Download the React DevTools" },
      { kind: "console", route: "/", message: "[HMR] connected" },
      { kind: "console", route: "/", message: "TypeError: x is not a function" },
    ]);
    expect(codes(withoutHydration)).toEqual(["console_error"]);
    expect(withoutHydration.warnings[0]!.message).toContain("TypeError");
  });
});

describe("selectCrawlRoutes", () => {
  const start = "https://vm-fly-jakem.fly.dev/chat_1";

  it("behåller same-origin under pathname-prefix, droppar start/hash/externa, stabil ordning", () => {
    expect(
      selectCrawlRoutes(
        [
          "/chat_1/about",
          "#section",
          "https://evil.example/x",
          "/chat_1",
          "/chat_1/about?x=1",
          "/chat_1/pricing#top",
          "/chat_10/other",
          "https://vm-fly-jakem.fly.dev/chat_1/contact",
        ],
        start,
        5,
      ),
    ).toEqual([
      "https://vm-fly-jakem.fly.dev/chat_1/about",
      "https://vm-fly-jakem.fly.dev/chat_1/pricing",
      "https://vm-fly-jakem.fly.dev/chat_1/contact",
    ]);
  });

  it("crawlar även när previewen ligger i roten (lokal dev)", () => {
    // Prefixet är "/" här. Naiv prefix-matchning bygger "//" och matchar
    // ingenting alls, så crawlen blir tyst tom i lokal utveckling.
    expect(
      selectCrawlRoutes(["/om-oss", "/blogg"], "http://localhost:3000/", 5),
    ).toEqual(["http://localhost:3000/om-oss", "http://localhost:3000/blogg"]);
  });

  it("respekterar max och returnerar tom lista vid ogiltig start", () => {
    expect(
      selectCrawlRoutes(["/chat_1/a", "/chat_1/b", "/chat_1/c"], start, 2),
    ).toEqual([
      "https://vm-fly-jakem.fly.dev/chat_1/a",
      "https://vm-fly-jakem.fly.dev/chat_1/b",
    ]);
    expect(selectCrawlRoutes(["/chat_1/a"], "not-a-url", 5)).toEqual([]);
  });
});
