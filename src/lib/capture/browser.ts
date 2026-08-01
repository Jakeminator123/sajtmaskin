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

const IS_SERVERLESS = Boolean(process.env.VERCEL);

export async function launchCaptureBrowser(): Promise<Browser> {
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

/**
 * Per-capture-grind: släpper bara igenom http(s) mot värdar som klarar
 * SSRF-kontrollen. Utfallet cachas per värd, så varje värd DNS-slås upp en
 * gång per capture.
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
  // SSR-DOM beskär en annan sida än den användaren markerade i. WebSockets går
  // därför genom samma värdgrind som allt annat.
  await page.context().routeWebSocket("**/*", async (ws) => {
    let hostname: string | null = null;
    try {
      const parsed = new URL(ws.url());
      if (["ws:", "wss:"].includes(parsed.protocol)) hostname = parsed.hostname;
    } catch {
      hostname = null;
    }
    if (hostname && (await hostAllowed(hostname))) {
      ws.connectToServer();
      return;
    }
    ws.close();
  });
  await page.context().route("**/*", async (route) => {
    try {
      if (!(await gate(route.request().url()))) {
        return await route.abort("blockedbyclient");
      }
      const response = await route.fetch({ maxRedirects: 0 });
      return await route.fulfill({ response });
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
