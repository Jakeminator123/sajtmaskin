/**
 * Delad browser-start för allt som fotograferar en sida.
 *
 * Det fanns två sätt att starta Chromium i repot och bara det ena fungerade i
 * produktion. Projektminiatyrerna använder `@sparticuz/chromium` +
 * `playwright-core`, som är byggt för att köra i en serverless-funktion.
 * Inspector-capture importerade i stället `playwright` rakt av — en
 * devDependency med egen medföljande Chromium — och behövde därför en
 * `IS_SERVERLESS`-spärr som svarade 503. Följden var att hela bildvägen i
 * inspektorn var lokal-bara: den fungerade i utveckling och var död i prod,
 * utan att något test eller någon check kunde märka skillnaden.
 *
 * En startpunkt, ett beteende. Ska något fotograferas härifrån ska det
 * fungera på samma ställen som resten av produkten.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Browser, Page } from "playwright-core";
import { hostResolvesToPrivate, isDisallowedHost } from "@/lib/ssrf-guard";
import { isTrustedCaptureDnsHost } from "@/lib/capture/preview-allowlist";
import { fetchWithPinnedDns } from "@/lib/capture/pinned-fetch";

const IS_SERVERLESS = Boolean(process.env.VERCEL);

/**
 * Serialize capture-browser lifetimes inside one isolate.
 *
 * Product Postcheck and thumbnail capture both call `launchCaptureBrowser` from
 * separate API routes. On a warm Vercel instance they can overlap: one path's
 * `browser.close()` then surfaces as `Target page, context or browser has been
 * closed` in the other (SM-025 — chats `3a6c5472`, `1b906aa1`). Holding the
 * lock from successful launch until `close()` (or launch failure) keeps those
 * paths from sharing the Sparticuz/Chromium slot. Cross-isolate races are out
 * of scope for this mutex.
 */
let captureBrowserGate: Promise<void> = Promise.resolve();

/**
 * `playwright-core` och `@sparticuz/chromium` måste uppgraderas TILLSAMMANS.
 *
 * Serverless-grenen nedan låter `playwright-core` driva Sparticuz-binären via
 * `executablePath()`. Varje playwright-version är byggd mot en bestämd
 * Chromium-major, så bumpas bara den ena hamnar drivrutin och binär i otakt.
 * Det syns inte i någon check: lokalt och i CI används devDependencyn
 * `playwright` med sin egen medföljande Chromium, så `quality` och `build` är
 * gröna medan projektminiatyrer och inspector-capture går sönder i prod.
 *
 * Läge 2026-08-04: `playwright-core` 1.61.1 → Chromium 149.0.7827.55, och
 * `@sparticuz/chromium` ^149.0.0 matchar. Dependabot-PR #750 ville lyfta
 * `playwright-core` till 1.62.1 (Chromium 151) medan Sparticuz senaste
 * publicerade version fortfarande var 149.0.0 — den stängdes därför.
 *
 * Innan nästa bump: kontrollera `npm view @sparticuz/chromium versions` och
 * `node_modules/playwright-core/browsers.json` (fältet `browserVersion`) och
 * bekräfta samma Chromium-major. Går det inte ihop — vänta, bumpa inte ensam.
 * Trasslar bildfångsten i prod strax efter en dependency-uppdatering är det
 * här du ska titta först.
 */
/**
 * Mätsteg för `/tmp`-reprot (`SM-072`): Chromium loggade "free space in
 * temporary directory: 0" och dog i `browser.newPage`. Fluid Compute
 * återanvänder instansen, så /tmp ackumulerar (Sparticuz-binär, läckta
 * Playwright-profiler, run-NDJSON). Prod 2026-08-31 (chat `30840b09`, dpl
 * `dpl_81XhZUJJ…`): 513 → 31 → 23 MB fritt på fem minuter, två postcheck-skip
 * med `Target page, context or browser has been closed`. Raden per launch gör
 * förloppet mätbart i Vercel-loggen; returvärdet driver trycksvepet nedan.
 * Fail-open — statfs får aldrig stoppa en capture.
 */
async function measureTmpFreeSpaceBestEffort(): Promise<number | null> {
  try {
    const [{ statfs }, osMod] = await Promise.all([import("node:fs/promises"), import("node:os")]);
    const tmp = osMod.default.tmpdir();
    const stat = await statfs(tmp);
    const freeMb = Math.round((stat.bavail * stat.bsize) / 1_048_576);
    const totalMb = Math.round((stat.blocks * stat.bsize) / 1_048_576);
    console.warn(
      `[capture-browser] free space in temporary directory: ${freeMb}MB of ${totalMb}MB (${tmp})`,
    );
    return freeMb;
  } catch {
    // Best effort only.
    return null;
  }
}

/**
 * playwright-core skriver `playwright_chromiumdev_profile-*` under os.tmpdir()
 * och städar vid ren `close()`. En dödad Fluid-invocation lämnar mapparna kvar
 * tills /tmp tar slut. Svepet är fail-open, åldersbundet (levande launch i en
 * annan isolate är färskare än 15 min) och takat så det inte äter launch-budget.
 *
 * Åldersgränsen är tvådelad sedan SM-072-reproduktionen: i normalläge gäller
 * 15 min (skyddar en samtidig capture i annan isolate), men när /tmp redan är
 * under tryck flippar avvägningen — en burst av postchecks läcker snabbare än
 * 15-minutersgränsen hinner återvinna, och med < 200 MB fritt dör nästa
 * Chromium ändå. Under tryck sveps därför allt äldre än 2 min.
 */
const PLAYWRIGHT_PROFILE_PREFIX = "playwright_chromiumdev_profile-";
const PLAYWRIGHT_PROFILE_MAX_AGE_MS = 15 * 60 * 1000;
const PLAYWRIGHT_PROFILE_PRESSURE_AGE_MS = 2 * 60 * 1000;
const TMP_PRESSURE_FREE_MB = 200;
const PLAYWRIGHT_PROFILE_SWEEP_MAX_CANDIDATES = 100;
const PLAYWRIGHT_PROFILE_SWEEP_BUDGET_MS = 2_000;

function pruneLeakedPlaywrightProfilesBestEffort(
  maxAgeMs: number = PLAYWRIGHT_PROFILE_MAX_AGE_MS,
): number {
  try {
    const tmp = os.tmpdir();
    const started = Date.now();
    const entries = fs.readdirSync(tmp, { withFileTypes: true });
    let pruned = 0;
    let candidates = 0;
    for (const entry of entries) {
      if (Date.now() - started >= PLAYWRIGHT_PROFILE_SWEEP_BUDGET_MS) break;
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith(PLAYWRIGHT_PROFILE_PREFIX)) continue;
      const dir = path.join(tmp, entry.name);
      try {
        const ageMs = Date.now() - fs.statSync(dir).mtimeMs;
        if (ageMs < maxAgeMs) continue;
        // Kandidat-taket räknar bara RADERINGSFÖRSÖK (Bugbot high på diffen:
        // färska profiler fick inte äta budgeten så att gamla läckor aldrig
        // nåddes). Unga skips är redan tidsbundna via svep-budgeten ovan.
        candidates += 1;
        if (candidates > PLAYWRIGHT_PROFILE_SWEEP_MAX_CANDIDATES) break;
        fs.rmSync(dir, { recursive: true, force: true });
        pruned += 1;
      } catch {
        // En låst/försvunnen kandidat får inte stoppa resten av svepet.
      }
    }
    return pruned;
  } catch {
    return 0;
  }
}

/**
 * SM-072-diagnos: prod 2026-09-01 (chat `4cac8fb0`) hade 18 MB fritt vid
 * launch och trycksvepet hittade INGA profiler att rensa — ätaren är alltså
 * en annan artefakt. Under tryck listas /tmp:s största toppostposter med
 * ungefärlig storlek så nästa träff namnger boven i Vercel-loggen.
 * Fail-open och budgetstyrt — diagnosen får aldrig stoppa eller försena en
 * capture nämnvärt.
 */
const TMP_TOP_CONSUMER_COUNT = 6;
const TMP_TOP_SCAN_BUDGET_MS = 1_500;
const TMP_TOP_SCAN_MAX_ENTRIES = 5_000;

function logTmpTopConsumersBestEffort(): void {
  try {
    const tmp = os.tmpdir();
    const started = Date.now();
    let scanned = 0;

    const sizeOf = (target: string): number => {
      if (Date.now() - started >= TMP_TOP_SCAN_BUDGET_MS) return 0;
      if (scanned >= TMP_TOP_SCAN_MAX_ENTRIES) return 0;
      scanned += 1;
      try {
        const stat = fs.lstatSync(target);
        if (stat.isFile()) return stat.size;
        if (!stat.isDirectory()) return 0;
        let total = 0;
        for (const entry of fs.readdirSync(target)) {
          total += sizeOf(path.join(target, entry));
          if (Date.now() - started >= TMP_TOP_SCAN_BUDGET_MS) break;
        }
        return total;
      } catch {
        return 0;
      }
    };

    const rows = fs
      .readdirSync(tmp)
      .map((name) => ({ name, mb: Math.round(sizeOf(path.join(tmp, name)) / 1_048_576) }))
      .filter((row) => row.mb >= 1)
      .sort((a, b) => b.mb - a.mb)
      .slice(0, TMP_TOP_CONSUMER_COUNT);
    const truncated =
      Date.now() - started >= TMP_TOP_SCAN_BUDGET_MS || scanned >= TMP_TOP_SCAN_MAX_ENTRIES;
    console.warn(
      `[capture-browser] tmp top consumers${truncated ? " (truncated scan)" : ""}: ${
        rows.length > 0 ? rows.map((row) => `${row.name}=${row.mb}MB`).join(", ") : "none >= 1MB"
      }`,
    );
  } catch {
    // Best effort only.
  }
}

async function launchCaptureBrowserUnscoped(): Promise<Browser> {
  if (IS_SERVERLESS) {
    const freeMb = await measureTmpFreeSpaceBestEffort();
    const underPressure = freeMb !== null && freeMb < TMP_PRESSURE_FREE_MB;
    if (underPressure) logTmpTopConsumersBestEffort();
    const pruned = pruneLeakedPlaywrightProfilesBestEffort(
      underPressure ? PLAYWRIGHT_PROFILE_PRESSURE_AGE_MS : PLAYWRIGHT_PROFILE_MAX_AGE_MS,
    );
    if (pruned > 0) {
      console.warn(`[capture-browser] pruned ${pruned} leaked Playwright profile dir(s)`);
      await measureTmpFreeSpaceBestEffort();
    }
    const chromium = (await import("@sparticuz/chromium")).default;
    const { chromium: pw } = await import("playwright-core");
    return pw.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Lokalt: full `playwright` (devDependency) har sin egen Chromium.
  const { chromium: pw } = await import("playwright");
  return pw.launch({ headless: true }) as unknown as Browser;
}

/**
 * En transient Chromium-spawnflake ska inte kosta hela DOM-kontrollen.
 * Prod 2026-08-27 (chat 560afbc9, v2): launchen dog och postcheck skippades
 * med `playwright_unavailable` — trots att samma deployment lanserade lyckat
 * två minuter tidigare (4 sådana skips på 14 dagar). Exakt ETT omförsök efter
 * kort paus; ett deterministiskt fel (t.ex. saknad binär) failar likadant två
 * gånger och kastas vidare oförändrat. Gaten hålls över båda försöken så
 * ingen annan capture kan smyga in mellan dem.
 */
const LAUNCH_RETRY_DELAY_MS = 750;

async function launchCaptureBrowserWithRetry(): Promise<Browser> {
  try {
    return await launchCaptureBrowserUnscoped();
  } catch (firstError) {
    const message =
      firstError instanceof Error ? firstError.message : String(firstError);
    console.warn(
      `[capture-browser] launch failed, retrying once in ${LAUNCH_RETRY_DELAY_MS}ms: ${message.slice(0, 200)}`,
    );
    await new Promise((resolve) => setTimeout(resolve, LAUNCH_RETRY_DELAY_MS));
    return launchCaptureBrowserUnscoped();
  }
}

export async function launchCaptureBrowser(): Promise<Browser> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = captureBrowserGate;
  captureBrowserGate = gate;
  await previous;

  try {
    const browser = await launchCaptureBrowserWithRetry();
    const originalClose = browser.close.bind(browser);
    let released = false;
    const releaseOnce = () => {
      if (!released) {
        released = true;
        release();
      }
    };
    browser.close = (async (...args: Parameters<Browser["close"]>) => {
      try {
        return await originalClose(...args);
      } finally {
        releaseOnce();
      }
    }) as Browser["close"];
    return browser;
  } catch (error) {
    release();
    throw error;
  }
}

/**
 * Per-capture-grind: släpper bara igenom http(s) mot värdar som klarar
 * SSRF-kontrollen. Utfallet cachas per värd, så varje värd DNS-slås upp en
 * gång per capture.
 *
 * Grinden prövar ett NAMN och är därför bara ett förfilter — den kan inte veta
 * vilken adress som sedan ansluts. Skyddet mot att svaret kommer från en annan
 * adress än den granskade ligger i `fetchWithPinnedDns`.
 */
export function buildCaptureHostGate(): (hostname: string) => Promise<boolean> {
  const hostVerdicts = new Map<string, boolean>();
  return async (hostname: string): Promise<boolean> => {
    const cached = hostVerdicts.get(hostname);
    if (cached !== undefined) return cached;
    const allowed = !isDisallowedHost(hostname) && !(await hostResolvesToPrivate(hostname));
    hostVerdicts.set(hostname, allowed);
    return allowed;
  };
}

export function buildCaptureRequestGate(
  hostAllowed: (hostname: string) => Promise<boolean> = buildCaptureHostGate(),
): (requestUrl: string) => Promise<boolean> {
  return async (requestUrl: string): Promise<boolean> => {
    try {
      const parsed = new URL(requestUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) return false;
      return await hostAllowed(parsed.hostname);
    } catch {
      return false;
    }
  };
}

/**
 * Koppla grinden till hela browser-kontexten och blockera service workers.
 *
 * Routing på KONTEXT-nivå så popup-fönster täcks, inte bara huvudsidan.
 * `route.fetch({ maxRedirects: 0 })` + fulfill är avsiktligt: Playwright
 * återinterceptar inte interna redirect-hopp, så en redirect får inte följas
 * inuti en interception. Genom att fullfölja den råa 3xx:an utfärdar browsern
 * nästa hopp som en NY request, som går genom grinden igen.
 */
export async function applyCaptureRequestGate(page: Page): Promise<void> {
  // En värdgrind delas av båda kanalerna, så en värd DNS-slås upp en gång per
  // capture oavsett om den nås över HTTP eller WebSocket.
  const hostAllowed = buildCaptureHostGate();
  const gate = buildCaptureRequestGate(hostAllowed);
  // `route()` interceptar inte WebSocket-uppkopplingar — Playwright har en egen
  // `routeWebSocket` för den trafiken. Utan den kunde fotograferad kod öppna
  // `ws://`/`wss://` mot interna eller metadata-nära tjänster från den betrodda
  // serverless-runtimen, och att blockera service workers stänger inte den
  // kanalen (Codex P1 på #729). Att stänga ALLA WebSockets går däremot inte:
  // previewen hydreras via dev-serverns socket, och en capture som fotograferar
  // SSR-DOM beskär en annan sida än den användaren markerade i.
  //
  // Värdgrinden räcker inte här. `ws.connectToServer()` slår upp namnet på nytt
  // och tar ingen adress, så en angriparkontrollerad zon kan svara publikt vid
  // grinden och privat vid uppkopplingen — samma rebinding som på HTTP-vägen,
  // fast utan möjlighet att pinna adressen. WebSockets begränsas därför till de
  // värdar operatören själv styr DNS för, vilket är precis vad hydreringen
  // behöver och inget mer.
  await page.context().routeWebSocket("**/*", async (ws) => {
    let hostname: string | null = null;
    try {
      const parsed = new URL(ws.url());
      if (["ws:", "wss:"].includes(parsed.protocol)) hostname = parsed.hostname;
    } catch {
      hostname = null;
    }
    if (hostname && isTrustedCaptureDnsHost(hostname) && (await hostAllowed(hostname))) {
      ws.connectToServer();
      return;
    }
    ws.close();
  });
  await page.context().route("**/*", async (route) => {
    try {
      const request = route.request();
      const requestUrl = request.url();
      if (!(await gate(requestUrl))) {
        return await route.abort("blockedbyclient");
      }
      // Preview-hostens egen värd behåller Playwrights hämtning: operatören
      // styr den zonen, så det finns ingen rebinding att skydda mot, och
      // sidans egen trafik (dokument, chunkar, RSC-payloads, kakor) fortsätter
      // gå genom den väg som redan är beprövad i prod.
      if (isTrustedCaptureDnsHost(new URL(requestUrl).hostname)) {
        const response = await route.fetch({ maxRedirects: 0 });
        return await route.fulfill({ response });
      }
      // Allt annat är tredjepartsresurser vars DNS vi inte styr — de hämtas mot
      // den adress som faktiskt granskades.
      const pinned = await fetchWithPinnedDns(requestUrl, {
        method: request.method(),
        headers: await request.allHeaders(),
        body: request.postDataBuffer(),
      });
      return await route.fulfill(pinned);
    } catch {
      return route.abort("failed").catch(() => undefined);
    }
  });
}

/**
 * Kastar om den slutliga huvudramens URL inte klarar anroparens allowlist.
 *
 * Request-grinden kontrollerar bara att varje värd är publik, så en redirect
 * eller en JS-navigering kan fortfarande landa på en godtycklig publik sajt.
 * Den URL som faktiskt fotograferas måste uppfylla samma allowlist som den
 * ursprungliga.
 */
export function assertFinalUrlAllowed(
  finalUrl: string,
  isAllowed: (url: URL) => boolean,
  label = "Capture",
): void {
  let parsed: URL;
  try {
    parsed = new URL(finalUrl);
  } catch {
    throw new Error(`${label} ended on an unparseable URL: ${finalUrl}`);
  }
  if (!isAllowed(parsed)) {
    throw new Error(`${label} navigated off the allowlist: ${parsed.hostname || finalUrl}`);
  }
}
