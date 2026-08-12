import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const launchCaptureBrowserMock = vi.hoisted(() => vi.fn());
const applyCaptureRequestGateMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/capture/browser", () => ({
  launchCaptureBrowser: launchCaptureBrowserMock,
  applyCaptureRequestGate: applyCaptureRequestGateMock,
}));

import {
  evaluateBrowserRuntimeIssues,
  evaluateProductDomSnapshot,
  evaluateRuntimeErrors,
  isAllowedProductPostcheckUrl,
  isHydrationConsoleError,
  isRenderFatalError,
  productPostcheckSkipReasonFromError,
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
      waitForLoadState: vi.fn(async () => {}),
      evaluate: vi.fn(async () => results[call++]),
      close: vi.fn(async () => {}),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    applyCaptureRequestGateMock.mockResolvedValue(undefined);
    const desktop = fakePage([{ anchors: [], images: [], ctas: [], forms: [] }, false]);
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

  it("rapporterar en kraschad undersida utan att blockera versionen", async () => {
    const desktop = fakePage([
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
  });

  it("släpper igenom riktiga console-fel", () => {
    expect(shouldIgnoreConsoleError("TypeError: x is not a function")).toBe(false);
    expect(shouldIgnoreConsoleError("Failed to load resource")).toBe(false);
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
