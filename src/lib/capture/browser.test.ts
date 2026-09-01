/**
 * Startpunkten avgör var bildfångst över huvud taget fungerar.
 *
 * Regressionen som gjorde den här modulen nödvändig var osynlig i test: två
 * kodvägar startade Chromium på olika sätt, den ena bara lokalt, och skillnaden
 * märktes först i prod som "knappen gör ingenting". Testerna nedan låser fast
 * vilken kombination som väljs i vilken miljö.
 */

import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sparticuzLaunch = vi.hoisted(() => vi.fn());
const localLaunch = vi.hoisted(() => vi.fn());
const isDisallowedHost = vi.hoisted(() => vi.fn());
const hostResolvesToPrivate = vi.hoisted(() => vi.fn());
const getPreviewHostBaseUrl = vi.hoisted(() => vi.fn());
const fetchWithPinnedDns = vi.hoisted(() => vi.fn());
const statfs = vi.hoisted(() => vi.fn());
const mockTmpdir = vi.hoisted(() => vi.fn(() => "/tmp"));

vi.mock("@sparticuz/chromium", () => ({
  default: {
    args: ["--no-sandbox"],
    executablePath: async () => "/tmp/chromium",
  },
}));
vi.mock("playwright-core", () => ({ chromium: { launch: sparticuzLaunch } }));
vi.mock("playwright", () => ({ chromium: { launch: localLaunch } }));
vi.mock("@/lib/ssrf-guard", () => ({ isDisallowedHost, hostResolvesToPrivate }));
// Allowlisten körs på riktigt — det är den som avgör vilken hämtningsväg en
// värd får — men preview-hostens bas kommer från env, så bara den mockas.
vi.mock("@/lib/gen/preview/tier2-config", () => ({ getPreviewHostBaseUrl }));
vi.mock("@/lib/capture/pinned-fetch", () => ({ fetchWithPinnedDns }));
vi.mock("node:fs/promises", () => ({ statfs }));
vi.mock("node:os", () => ({ default: { tmpdir: mockTmpdir }, tmpdir: mockTmpdir }));

const realOs = await vi.importActual<typeof import("node:os")>("node:os");

const ORIGINAL_VERCEL = process.env.VERCEL;
const ALLOWLIST_ENV_KEY = "NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES";
const ORIGINAL_ALLOWLIST = process.env[ALLOWLIST_ENV_KEY];
const PLAYWRIGHT_PROFILE_PREFIX = "playwright_chromiumdev_profile-";
const PROFILE_MAX_AGE_MS = 15 * 60 * 1000;

function realOsTmpdir(): string {
  return realOs.tmpdir();
}

let sweepTmp: string | undefined;

function createSweepTmp(): string {
  sweepTmp = fs.mkdtempSync(path.join(realOsTmpdir(), "capture-tmp-"));
  mockTmpdir.mockReturnValue(sweepTmp);
  return sweepTmp;
}

function makeDir(parent: string, name: string, ageMs: number): string {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "marker.txt"), "keep-or-prune");
  const when = new Date(Date.now() - ageMs);
  fs.utimesSync(dir, when, when);
  return dir;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTmpdir.mockImplementation(() => "/tmp");
  vi.resetModules();
  sparticuzLaunch.mockResolvedValue({ id: "serverless" });
  localLaunch.mockResolvedValue({ id: "local" });
  isDisallowedHost.mockReturnValue(false);
  hostResolvesToPrivate.mockResolvedValue(false);
  getPreviewHostBaseUrl.mockReturnValue("https://site.fly.dev/p");
  fetchWithPinnedDns.mockResolvedValue({
    status: 200,
    headers: { "content-type": "image/png" },
    body: Buffer.from("pinned-bytes"),
  });
  statfs.mockResolvedValue({ bavail: 512, bsize: 1024, blocks: 1024 });
  delete process.env[ALLOWLIST_ENV_KEY];
});

afterEach(() => {
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL_VERCEL;
  if (ORIGINAL_ALLOWLIST === undefined) delete process.env[ALLOWLIST_ENV_KEY];
  else process.env[ALLOWLIST_ENV_KEY] = ORIGINAL_ALLOWLIST;
  if (sweepTmp) {
    fs.rmSync(sweepTmp, { recursive: true, force: true });
    sweepTmp = undefined;
  }
});

describe("launchCaptureBrowser", () => {
  it("använder @sparticuz/chromium när den kör serverless", async () => {
    // Detta är hela poängen: utan den här vägen svarade inspector-capture 503
    // i prod, så bildfångsten fanns bara i utvecklarens maskin.
    process.env.VERCEL = "1";
    sparticuzLaunch.mockResolvedValue({
      id: "serverless",
      close: async () => undefined,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    expect(sparticuzLaunch).toHaveBeenCalledTimes(1);
    expect(localLaunch).not.toHaveBeenCalled();
    expect(sparticuzLaunch.mock.calls[0][0]).toMatchObject({
      executablePath: "/tmp/chromium",
      headless: true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[capture-browser] free space in temporary directory: 1MB of 1MB (/tmp)",
    );
    warnSpy.mockRestore();
  });

  it("använder den lokala playwright-installationen utanför serverless", async () => {
    delete process.env.VERCEL;
    localLaunch.mockResolvedValue({
      id: "local",
      close: async () => undefined,
    });
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    expect(localLaunch).toHaveBeenCalledTimes(1);
    expect(sparticuzLaunch).not.toHaveBeenCalled();
  });

  it("släpper inte in en andra launch förrän den första browsern stängts (SM-025)", async () => {
    // Prod: postcheck och thumbnail delar warm-instans och dödar varandras
    // Chromium mitt i kontrollen. Kön håller livstiden, inte bara launch.
    delete process.env.VERCEL;
    let resolveFirstClose!: () => void;
    const firstCloseBarrier = new Promise<void>((resolve) => {
      resolveFirstClose = resolve;
    });
    let secondLaunchStarted = false;

    localLaunch.mockImplementationOnce(async () => ({
      id: "first",
      close: async () => {
        resolveFirstClose();
      },
    }));
    localLaunch.mockImplementationOnce(async () => {
      secondLaunchStarted = true;
      return { id: "second", close: async () => undefined };
    });

    const { launchCaptureBrowser } = await import("./browser");
    const first = await launchCaptureBrowser();
    const secondPromise = launchCaptureBrowser();

    await Promise.resolve();
    expect(secondLaunchStarted).toBe(false);
    expect(localLaunch).toHaveBeenCalledTimes(1);

    await first.close();
    await firstCloseBarrier;
    const second = await secondPromise;
    expect(secondLaunchStarted).toBe(true);
    expect(localLaunch).toHaveBeenCalledTimes(2);
    await second.close();
  });

  it("raderar en läckt Playwright-profil äldre än 15 minuter före serverless-launch", async () => {
    process.env.VERCEL = "1";
    sparticuzLaunch.mockResolvedValue({
      id: "serverless",
      close: async () => undefined,
    });
    const tmp = createSweepTmp();
    const oldDir = makeDir(tmp, `${PLAYWRIGHT_PROFILE_PREFIX}old`, PROFILE_MAX_AGE_MS + 60_000);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    expect(fs.existsSync(oldDir)).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      "[capture-browser] pruned 1 leaked Playwright profile dir(s)",
    );
    const measureCalls = warnSpy.mock.calls.filter((call) =>
      String(call[0]).includes("free space in temporary directory"),
    );
    expect(measureCalls).toHaveLength(2);
    warnSpy.mockRestore();
  });

  it("raderar Chromium-core-dumps oavsett ålder före serverless-launch (SM-072)", async () => {
    // Prod 2026-09-01 (chat 3b9ca137): `core.chromium.24` på 913 MB fyllde
    // ensam tmpfs:en och varje senare launch dog. En core dump i lambdan har
    // ingen läsare — den ska bort direkt, även om den är nyskriven.
    process.env.VERCEL = "1";
    sparticuzLaunch.mockResolvedValue({
      id: "serverless",
      close: async () => undefined,
    });
    const tmp = createSweepTmp();
    const freshCore = path.join(tmp, "core.chromium.24");
    fs.writeFileSync(freshCore, "core-dump-bytes");
    const unrelatedFile = path.join(tmp, "corefile.txt");
    fs.writeFileSync(unrelatedFile, "keep");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    expect(fs.existsSync(freshCore)).toBe(false);
    expect(fs.existsSync(unrelatedFile)).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      "[capture-browser] pruned 1 Chromium core dump(s)",
    );
    warnSpy.mockRestore();
  });

  it("behåller en färsk Playwright-profil under 15 minuter", async () => {
    process.env.VERCEL = "1";
    sparticuzLaunch.mockResolvedValue({
      id: "serverless",
      close: async () => undefined,
    });
    const tmp = createSweepTmp();
    const freshDir = makeDir(tmp, `${PLAYWRIGHT_PROFILE_PREFIX}fresh`, 60_000);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    expect(fs.existsSync(freshDir)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/pruned \d+ leaked Playwright profile dir/),
    );
    warnSpy.mockRestore();
  });

  it("sveper en yngre läckt profil när /tmp är under tryck (SM-072)", async () => {
    // Prod 2026-08-31: /tmp föll 513 → 23 MB fritt inom en burst-session och
    // nästa Chromium dog. Under tryck (< 200 MB fritt) flippar avvägningen —
    // då gäller 2-minutersgränsen i stället för 15.
    process.env.VERCEL = "1";
    sparticuzLaunch.mockResolvedValue({
      id: "serverless",
      close: async () => undefined,
    });
    // Default-mocken ger ~1 MB fritt = tryck.
    const tmp = createSweepTmp();
    const midAgedDir = makeDir(tmp, `${PLAYWRIGHT_PROFILE_PREFIX}mid`, 5 * 60 * 1000);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    expect(fs.existsSync(midAgedDir)).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      "[capture-browser] pruned 1 leaked Playwright profile dir(s)",
    );
    warnSpy.mockRestore();
  });

  it("behåller en 5 minuter gammal profil när /tmp har gott om plats", async () => {
    process.env.VERCEL = "1";
    sparticuzLaunch.mockResolvedValue({
      id: "serverless",
      close: async () => undefined,
    });
    // ~400 MB fritt av ~512 MB — inget tryck, 15-minutersgränsen gäller.
    statfs.mockResolvedValue({ bavail: 409_600, bsize: 1024, blocks: 524_288 });
    const tmp = createSweepTmp();
    const midAgedDir = makeDir(tmp, `${PLAYWRIGHT_PROFILE_PREFIX}mid`, 5 * 60 * 1000);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    expect(fs.existsSync(midAgedDir)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/pruned \d+ leaked Playwright profile dir/),
    );
    warnSpy.mockRestore();
  });

  it("namnger /tmp:s största poster under tryck (SM-072-diagnos)", async () => {
    // Prod 2026-09-01: 18 MB fritt men inga profiler att rensa — utan
    // topplistan förblir ätaren anonym i loggen.
    process.env.VERCEL = "1";
    sparticuzLaunch.mockResolvedValue({
      id: "serverless",
      close: async () => undefined,
    });
    const tmp = createSweepTmp();
    const bigDir = path.join(tmp, "chromium-cache");
    fs.mkdirSync(bigDir);
    fs.writeFileSync(path.join(bigDir, "blob.bin"), Buffer.alloc(2 * 1_048_576));
    fs.writeFileSync(path.join(tmp, "tiny.txt"), "liten");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    const topLine = warnSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes("tmp top consumers"));
    expect(topLine).toBeTruthy();
    expect(topLine).toContain("chromium-cache=2MB");
    expect(topLine).not.toContain("tiny.txt");
    warnSpy.mockRestore();
  });

  it("hoppar över topplistan när /tmp har gott om plats", async () => {
    process.env.VERCEL = "1";
    sparticuzLaunch.mockResolvedValue({
      id: "serverless",
      close: async () => undefined,
    });
    statfs.mockResolvedValue({ bavail: 409_600, bsize: 1024, blocks: 524_288 });
    createSweepTmp();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    expect(
      warnSpy.mock.calls.some((call) => String(call[0]).includes("tmp top consumers")),
    ).toBe(false);
    warnSpy.mockRestore();
  });

  it("använder 15-minutersgränsen när statfs inte kan mäta /tmp", async () => {
    // Fail-open: utan mätning finns inget tryckbevis, så den försiktiga
    // gränsen gäller och en 5 minuter gammal profil lämnas i fred.
    process.env.VERCEL = "1";
    sparticuzLaunch.mockResolvedValue({
      id: "serverless",
      close: async () => undefined,
    });
    statfs.mockRejectedValue(new Error("statfs unavailable"));
    const tmp = createSweepTmp();
    const midAgedDir = makeDir(tmp, `${PLAYWRIGHT_PROFILE_PREFIX}mid`, 5 * 60 * 1000);
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    expect(fs.existsSync(midAgedDir)).toBe(true);
  });

  it("rör inte mappar vars namn inte matchar Playwright-profilprefixet", async () => {
    process.env.VERCEL = "1";
    sparticuzLaunch.mockResolvedValue({
      id: "serverless",
      close: async () => undefined,
    });
    const tmp = createSweepTmp();
    const otherDir = makeDir(tmp, "chromium-cache-unrelated", PROFILE_MAX_AGE_MS + 60_000);
    const almostDir = makeDir(tmp, "playwright_chromiumdev_profile", PROFILE_MAX_AGE_MS + 60_000);
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    expect(fs.existsSync(otherDir)).toBe(true);
    expect(fs.existsSync(almostDir)).toBe(true);
  });

  it("försöker igen exakt en gång när launchen kastar transient (SM-025-flake)", async () => {
    // Prod 2026-08-27: samma deployment lanserade lyckat 2 min tidigare, men
    // nästa launch dog och hela postchecken skippades som playwright_unavailable.
    // En transient spawnflake ska kosta ett omförsök, inte DOM-kontrollen.
    delete process.env.VERCEL;
    localLaunch.mockRejectedValueOnce(new Error("browserType.launch: spawn failure"));
    localLaunch.mockResolvedValueOnce({ id: "local", close: async () => undefined });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    expect(localLaunch).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[capture-browser] launch failed, retrying once"),
    );
    warnSpy.mockRestore();
  }, 15_000);

  it("kastar andra felet vidare och släpper gaten när även omförsöket faller", async () => {
    // Deterministiska fel (saknad binär) ska inte maskeras — och en död launch
    // får inte lämna mutexen låst för nästa capture.
    delete process.env.VERCEL;
    localLaunch.mockRejectedValueOnce(new Error("first spawn failure"));
    localLaunch.mockRejectedValueOnce(new Error("second spawn failure"));
    localLaunch.mockResolvedValueOnce({ id: "local", close: async () => undefined });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { launchCaptureBrowser } = await import("./browser");

    await expect(launchCaptureBrowser()).rejects.toThrow("second spawn failure");

    // Gaten är släppt: en efterföljande launch går igenom utan att fastna.
    const browser = await launchCaptureBrowser();
    await browser.close();
    expect(localLaunch).toHaveBeenCalledTimes(3);
    warnSpy.mockRestore();
  }, 15_000);

  it("låter serverless-launch fortsätta när profilsvepet kastar", async () => {
    process.env.VERCEL = "1";
    sparticuzLaunch.mockResolvedValue({
      id: "serverless",
      close: async () => undefined,
    });
    mockTmpdir.mockReturnValue(path.join(realOsTmpdir(), "capture-tmp-missing", "no-such-dir"));
    const { launchCaptureBrowser } = await import("./browser");

    const browser = await launchCaptureBrowser();
    await browser.close();

    expect(sparticuzLaunch).toHaveBeenCalledTimes(1);
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

  async function runRequestHandler(url: string) {
    const { page, route } = fakePage();
    const { applyCaptureRequestGate } = await import("./browser");
    await applyCaptureRequestGate(page);

    const fetch = vi.fn().mockResolvedValue({ id: "playwright-response" });
    const fulfill = vi.fn().mockResolvedValue(undefined);
    const abort = vi.fn().mockResolvedValue(undefined);
    await route.mock.calls[0][1]({
      request: () => ({
        url: () => url,
        method: () => "GET",
        allHeaders: async () => ({ "x-from-browser": "1" }),
        postDataBuffer: () => null,
      }),
      fetch,
      fulfill,
      abort,
    });
    return { fetch, fulfill, abort };
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

  it("stänger en WebSocket mot en publik värd utanför allowlisten", async () => {
    // `ws.connectToServer()` slår upp namnet på nytt och tar ingen adress, så
    // en angriparkontrollerad zon kan svara publikt vid grinden och privat vid
    // uppkopplingen. Adressen går inte att pinna här — värden måste därför vara
    // en vi styr DNS för.
    const { close, connectToServer } = await wsVerdict("wss://angripare.example/socket");

    expect(close).toHaveBeenCalledTimes(1);
    expect(connectToServer).not.toHaveBeenCalled();
  });

  it("låter en WebSocket mot en operatörslistad värd gå fram", async () => {
    process.env[ALLOWLIST_ENV_KEY] = "preview-two.example";
    const { close, connectToServer } = await wsVerdict("wss://preview-two.example/socket");

    expect(connectToServer).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it("registrerar request-grinden för all övrig trafik", async () => {
    const { page, route } = fakePage();
    const { applyCaptureRequestGate } = await import("./browser");

    await applyCaptureRequestGate(page);

    expect(route).toHaveBeenCalledWith("**/*", expect.any(Function));
  });

  it("låter preview-hostens egen trafik gå via Playwrights hämtning", async () => {
    // Operatören styr den zonen, så det finns ingen rebinding att skydda mot —
    // och sidans egen trafik ska inte byta hämtningsväg i onödan.
    const { fetch, fulfill } = await runRequestHandler("https://site.fly.dev/p/app.js");

    expect(fetch).toHaveBeenCalledWith({ maxRedirects: 0 });
    expect(fulfill).toHaveBeenCalledWith({ response: { id: "playwright-response" } });
    expect(fetchWithPinnedDns).not.toHaveBeenCalled();
  });

  it("hämtar en tredjepartsresurs med pinnad adress i stället för route.fetch", async () => {
    // Kärnan i fixen: `route.fetch()` slår upp värden på nytt i Playwrights
    // egen Node-stack, så en subresurs från en angriparkontrollerad zon kunde
    // landa på en privat adress efter att grinden sagt ja.
    const { fetch, fulfill } = await runRequestHandler("https://cdn.angripare.example/bild.png");

    expect(fetch).not.toHaveBeenCalled();
    expect(fetchWithPinnedDns).toHaveBeenCalledWith("https://cdn.angripare.example/bild.png", {
      method: "GET",
      headers: { "x-from-browser": "1" },
      body: null,
    });
    expect(fulfill).toHaveBeenCalledWith({
      status: 200,
      headers: { "content-type": "image/png" },
      body: Buffer.from("pinned-bytes"),
    });
  });

  it("avbryter innan hämtning när värdgrinden säger nej", async () => {
    hostResolvesToPrivate.mockResolvedValue(true);
    const { fetch, fulfill, abort } = await runRequestHandler("http://169.254.169.254/latest");

    expect(abort).toHaveBeenCalledWith("blockedbyclient");
    expect(fetch).not.toHaveBeenCalled();
    expect(fetchWithPinnedDns).not.toHaveBeenCalled();
    expect(fulfill).not.toHaveBeenCalled();
  });

  it("avbryter requesten när den pinnade hämtningen blockerar adressen", async () => {
    fetchWithPinnedDns.mockRejectedValue(new Error("Pinned fetch blocked"));
    const { fulfill, abort } = await runRequestHandler("https://cdn.angripare.example/bild.png");

    expect(abort).toHaveBeenCalledWith("failed");
    expect(fulfill).not.toHaveBeenCalled();
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
