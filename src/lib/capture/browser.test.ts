/**
 * Startpunkten avgör var bildfångst över huvud taget fungerar.
 *
 * Regressionen som gjorde den här modulen nödvändig var osynlig i test: två
 * kodvägar startade Chromium på olika sätt, den ena bara lokalt, och skillnaden
 * märktes först i prod som "knappen gör ingenting". Testerna nedan låser fast
 * vilken kombination som väljs i vilken miljö.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sparticuzLaunch = vi.hoisted(() => vi.fn());
const localLaunch = vi.hoisted(() => vi.fn());
const isDisallowedHost = vi.hoisted(() => vi.fn());
const hostResolvesToPrivate = vi.hoisted(() => vi.fn());

vi.mock("@sparticuz/chromium", () => ({
  default: {
    args: ["--no-sandbox"],
    executablePath: async () => "/tmp/chromium",
  },
}));
vi.mock("playwright-core", () => ({ chromium: { launch: sparticuzLaunch } }));
vi.mock("playwright", () => ({ chromium: { launch: localLaunch } }));
vi.mock("@/lib/ssrf-guard", () => ({ isDisallowedHost, hostResolvesToPrivate }));

const ORIGINAL_VERCEL = process.env.VERCEL;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  sparticuzLaunch.mockResolvedValue({ id: "serverless" });
  localLaunch.mockResolvedValue({ id: "local" });
  isDisallowedHost.mockReturnValue(false);
  hostResolvesToPrivate.mockResolvedValue(false);
});

afterEach(() => {
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL_VERCEL;
});

describe("launchCaptureBrowser", () => {
  it("använder @sparticuz/chromium när den kör serverless", async () => {
    // Detta är hela poängen: utan den här vägen svarade inspector-capture 503
    // i prod, så bildfångsten fanns bara i utvecklarens maskin.
    process.env.VERCEL = "1";
    const { launchCaptureBrowser } = await import("./browser");

    await launchCaptureBrowser();

    expect(sparticuzLaunch).toHaveBeenCalledTimes(1);
    expect(localLaunch).not.toHaveBeenCalled();
    expect(sparticuzLaunch.mock.calls[0][0]).toMatchObject({
      executablePath: "/tmp/chromium",
      headless: true,
    });
  });

  it("använder den lokala playwright-installationen utanför serverless", async () => {
    delete process.env.VERCEL;
    const { launchCaptureBrowser } = await import("./browser");

    await launchCaptureBrowser();

    expect(localLaunch).toHaveBeenCalledTimes(1);
    expect(sparticuzLaunch).not.toHaveBeenCalled();
  });
});

describe("buildCaptureRequestGate", () => {
  it("släpper igenom en publik http(s)-värd", async () => {
    const { buildCaptureRequestGate } = await import("./browser");
    const gate = buildCaptureRequestGate();
    expect(await gate("https://site.fly.dev/app.js")).toBe(true);
  });

  it("stoppar en värd som pekar inåt", async () => {
    hostResolvesToPrivate.mockResolvedValue(true);
    const { buildCaptureRequestGate } = await import("./browser");
    const gate = buildCaptureRequestGate();
    expect(await gate("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("stoppar allt som inte är http(s)", async () => {
    const { buildCaptureRequestGate } = await import("./browser");
    const gate = buildCaptureRequestGate();
    expect(await gate("file:///etc/passwd")).toBe(false);
    expect(await gate("inte-en-url")).toBe(false);
  });

  it("slår upp varje värd en gång per capture", async () => {
    const { buildCaptureRequestGate } = await import("./browser");
    const gate = buildCaptureRequestGate();
    await gate("https://site.fly.dev/a.js");
    await gate("https://site.fly.dev/b.js");
    expect(hostResolvesToPrivate).toHaveBeenCalledTimes(1);
  });
});

describe("applyCaptureRequestGate", () => {
  function fakePage() {
    const route = vi.fn();
    const routeWebSocket = vi.fn();
    const context = { route, routeWebSocket };
    return { page: { context: () => context } as never, route, routeWebSocket };
  }

  async function wsVerdict(url: string) {
    const { page, routeWebSocket } = fakePage();
    const { applyCaptureRequestGate } = await import("./browser");
    await applyCaptureRequestGate(page);
    expect(routeWebSocket).toHaveBeenCalledWith("**/*", expect.any(Function));

    const close = vi.fn();
    const connectToServer = vi.fn();
    await routeWebSocket.mock.calls[0][1]({ url: () => url, close, connectToServer });
    return { close, connectToServer };
  }

  it("låter previewens egen WebSocket gå fram", async () => {
    // Att stänga alla WS hade brutit hydreringen, och en capture av SSR-DOM
    // beskär en annan sida än den användaren markerade i.
    const { close, connectToServer } = await wsVerdict("wss://site.fly.dev/_next/webpack-hmr");

    expect(connectToServer).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it("stänger en WebSocket mot en värd som pekar inåt", async () => {
    // `context.route` interceptar inte WebSockets, så utan den här kanalen kunde
    // fotograferad kod nå interna tjänster trots request-grinden.
    hostResolvesToPrivate.mockResolvedValue(true);
    const { close, connectToServer } = await wsVerdict("ws://169.254.169.254/latest");

    expect(close).toHaveBeenCalledTimes(1);
    expect(connectToServer).not.toHaveBeenCalled();
  });

  it("stänger en uppkoppling som inte är ws(s) eller inte går att tolka", async () => {
    expect((await wsVerdict("http://site.fly.dev/x")).close).toHaveBeenCalledTimes(1);
    expect((await wsVerdict("inte-en-url")).close).toHaveBeenCalledTimes(1);
  });

  it("registrerar request-grinden för all övrig trafik", async () => {
    const { page, route } = fakePage();
    const { applyCaptureRequestGate } = await import("./browser");

    await applyCaptureRequestGate(page);

    expect(route).toHaveBeenCalledWith("**/*", expect.any(Function));
  });
});

describe("assertFinalUrlAllowed", () => {
  it("släpper igenom en URL som klarar allowlisten", async () => {
    const { assertFinalUrlAllowed } = await import("./browser");
    expect(() =>
      assertFinalUrlAllowed("https://site.fly.dev/x", (u) => u.hostname === "site.fly.dev"),
    ).not.toThrow();
  });

  it("kastar när sidan navigerat till en annan publik värd", async () => {
    // Request-grinden tillåter vilken publik värd som helst, så en redirect
    // kan flytta huvudramen bort från previewen mellan navigering och skott.
    const { assertFinalUrlAllowed } = await import("./browser");
    expect(() =>
      assertFinalUrlAllowed(
        "https://angripare.example/x",
        (u) => u.hostname === "site.fly.dev",
        "Inspector capture",
      ),
    ).toThrow(/Inspector capture navigated off the allowlist/);
  });

  it("kastar på en URL som inte går att tolka", async () => {
    const { assertFinalUrlAllowed } = await import("./browser");
    expect(() => assertFinalUrlAllowed("", () => true)).toThrow(/unparseable URL/);
  });

  it("kastar även när allowlisten skulle ha sagt ja till allt", async () => {
    // En sida som slutade på något otolkbart får aldrig fotograferas bara för
    // att anroparens allowlist är generös — parsningen är den första grinden.
    const { assertFinalUrlAllowed } = await import("./browser");
    expect(() => assertFinalUrlAllowed("inte en url", () => true)).toThrow();
  });
});
