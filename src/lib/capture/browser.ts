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
async function launchCaptureBrowserUnscoped(): Promise<Browser> {
  if (IS_SERVERLESS) {
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

export async function launchCaptureBrowser(): Promise<Browser> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = captureBrowserGate;
  captureBrowserGate = gate;
  await previous;

  try {
    const browser = await launchCaptureBrowserUnscoped();
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
