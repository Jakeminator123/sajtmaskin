/**
 * HTTP-hämtning där adressen som VALIDERAS är exakt den som ANSLUTS till.
 *
 * Capture-grinden kontrollerade tidigare bara värdNAMNET: `hostResolvesToPrivate`
 * slog upp namnet, cachade ett booleskt beslut, och lämnade sedan över namnet
 * till `route.fetch()`, som slår upp det EN GÅNG TILL i Playwrights egen
 * Node-stack. En angriparkontrollerad zon med kort TTL kunde svara publik IP vid
 * kontrollen och `127.0.0.1`/`169.254.169.254` vid anslutningen — klassisk DNS
 * rebinding. Fotograferad kod är användargenererad, så en inloggad användare
 * kunde låta sin egen preview ladda en subresurs från en sådan värd och läsa av
 * svaret i själva skärmbilden (extern granskning av PR #729).
 *
 * Fixen är att inte lämna över namnet. `lookup` nedan är den ENDA
 * uppslagningen: den validerar posterna och returnerar samma poster till
 * socketen, så det finns inget fönster mellan kontroll och anslutning. Namnet
 * står kvar i URL:en, så TLS-cert och SNI valideras mot värden som vanligt —
 * till skillnad från att skriva om URL:en till en IP med `Host`-header.
 *
 * Chromium-flaggan `--host-resolver-rules` löser inte det här: intercepterade
 * http(s)-requests hämtas av Playwright i Node-processen, inte av Chromiums
 * nätverksstack, så browserns resolver-regler ser dem aldrig.
 */

import http from "node:http";
import https from "node:https";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { lookup as dnsLookup, type LookupAllOptions } from "node:dns";
import type { LookupFunction } from "node:net";
import { isResolvedAddressPrivate } from "@/lib/ssrf-address";

const DEFAULT_TIMEOUT_MS = 15_000;
/** Taket finns för att en capture aldrig ska kunna dra ner processens minne. */
const DEFAULT_MAX_BODY_BYTES = 12 * 1024 * 1024;
const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const brotliDecompress = promisify(zlib.brotliDecompress);

export const PINNED_ADDRESS_BLOCKED_MESSAGE =
  "Pinned fetch blocked: hostname resolved to a private/internal address";
export const PINNED_BODY_LIMIT_PREFIX = "Pinned fetch aborted: response exceeded";
/** Same Node code zlib uses when `maxOutputLength` is exceeded. */
export const PINNED_BODY_LIMIT_CODE = "ERR_BUFFER_TOO_LARGE";

/**
 * Hop-by-hop-headers hör till EN uppkoppling och får aldrig vidarebefordras.
 * `transfer-encoding` måste bort särskilt: Node har redan av-chunkat kroppen.
 */
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  const allOptions: LookupAllOptions = { ...options, all: true };
  dnsLookup(hostname, allOptions, (error, addresses) => {
    if (error) {
      callback(error, "", 0);
      return;
    }
    // Hela svaret prövas, inte bara posten vi råkar välja: samma semantik som
    // `hostResolvesToPrivate`, och en socket som byter familj kan inte landa på
    // en post som aldrig granskades.
    if (addresses.length === 0 || addresses.some((entry) => isResolvedAddressPrivate(entry.address))) {
      callback(new Error(PINNED_ADDRESS_BLOCKED_MESSAGE), "", 0);
      return;
    }
    if (options.all) {
      callback(null, addresses);
      return;
    }
    callback(null, addresses[0].address, addresses[0].family);
  });
};

export type PinnedFetchResult = {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
};

export type PinnedFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer | null;
  timeoutMs?: number;
  maxBodyBytes?: number;
  signal?: AbortSignal;
};

function buildRequestHeaders(
  headers: Record<string, string> | undefined,
  body: Buffer | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(headers ?? {})) {
    const key = rawKey.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(key)) continue;
    // `host` och `content-length` sätts av Node utifrån URL respektive kropp.
    if (key === "host" || key === "content-length" || key === "accept-encoding") continue;
    out[key] = value;
  }
  // Vi buffrar svaret själva och tolkar ingen komprimering här.
  out["accept-encoding"] = "identity";
  if (body) out["content-length"] = String(body.byteLength);
  return out;
}

function buildResponseHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    if (value === undefined) continue;
    if (HOP_BY_HOP_HEADERS.has(key)) continue;
    // Kroppen fullföljs som buffer, så längden räknas om av den som svarar.
    if (key === "content-length") continue;
    // `set-cookie` är en lista och ryms inte i en header-map. En capture
    // behöver aldrig kakor från en tredjepartsresurs, så den släpps hellre än
    // slås ihop till ett värde som inte betyder samma sak.
    if (key === "set-cookie") continue;
    out[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}

function bodyLimitError(maxBodyBytes: number): NodeJS.ErrnoException {
  const error = new RangeError(
    `${PINNED_BODY_LIMIT_PREFIX} ${maxBodyBytes} bytes`,
  ) as NodeJS.ErrnoException;
  error.code = PINNED_BODY_LIMIT_CODE;
  return error;
}

/**
 * Decode gzip/br/deflate so callers see the same readable body contract as
 * `fetch()`. Wire size is already capped; `maxOutputLength` caps inflate so a
 * tiny zip-bomb cannot allocate past the caller limit before the byte check.
 */
function isDecompressLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String((error as NodeJS.ErrnoException).code) : "";
  return error instanceof RangeError || error.name === "RangeError" || code === PINNED_BODY_LIMIT_CODE;
}

async function decodePinnedBody(
  body: Buffer,
  encoding: string | undefined,
  maxBodyBytes: number,
): Promise<Buffer> {
  const normalized = (encoding ?? "identity").toLowerCase().trim();
  if (!normalized || normalized === "identity") return body;

  // Cap output during inflate so a tiny gzip/br payload cannot allocate first
  // and only then trip maxBodyBytes (zip-bomb / TOCTOU on the size check).
  const zlibOptions = { maxOutputLength: maxBodyBytes };
  try {
    if (normalized === "gzip" || normalized === "x-gzip") {
      return await gunzip(body, zlibOptions);
    }
    if (normalized === "deflate") return await inflate(body, zlibOptions);
    if (normalized === "br") return await brotliDecompress(body, zlibOptions);
    throw new Error(`Pinned fetch blocked: unsupported content-encoding ${normalized}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Pinned fetch")) throw error;
    if (isDecompressLimitError(error)) throw bodyLimitError(maxBodyBytes);
    throw new Error(`Pinned fetch failed: could not decode ${normalized} body`);
  }
}

/**
 * Hämtar `rawUrl` utan att någon annan än den här funktionen slår upp värden.
 * Kastar om namnet pekar på en privat/intern adress vid anslutningstillfället.
 */
export async function fetchWithPinnedDns(
  rawUrl: string,
  init: PinnedFetchInit = {},
): Promise<PinnedFetchResult> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Pinned fetch supports http(s) only, got ${url.protocol}`);
  }

  const isHttps = url.protocol === "https:";
  const body = init.body ?? null;
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBodyBytes = init.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  // Egen agent per hämtning: en delad, keep-alive-återanvänd socket hade kunnat
  // överleva till en värd vars DNS hunnit ändras, och då är pinningen borta.
  const agent = isHttps
    ? new https.Agent({ lookup: guardedLookup, keepAlive: false })
    : new http.Agent({ lookup: guardedLookup, keepAlive: false });

  try {
    return await new Promise<PinnedFetchResult>((resolve, reject) => {
      let settled = false;

      const request = (isHttps ? https : http).request(
        url,
        {
          method: init.method ?? "GET",
          headers: buildRequestHeaders(init.headers, body),
          agent,
        },
        onResponse,
      );

      const onAbort = () => {
        const error = new Error("Pinned fetch aborted");
        error.name = "AbortError";
        request.destroy(error);
      };
      const cleanup = () => init.signal?.removeEventListener("abort", onAbort);
      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const settleResolve = (result: PinnedFetchResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      function onResponse(response: http.IncomingMessage) {
        const chunks: Buffer[] = [];
        let received = 0;
        response.on("data", (chunk: Buffer) => {
          received += chunk.byteLength;
          if (received > maxBodyBytes) {
            const error = bodyLimitError(maxBodyBytes);
            response.destroy(error);
            request.destroy(error);
            settleReject(error);
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", settleReject);
        response.on("end", () => {
          const headers = buildResponseHeaders(response.headers);
          void decodePinnedBody(Buffer.concat(chunks), headers["content-encoding"], maxBodyBytes)
            .then((decodedBody) => {
              delete headers["content-encoding"];
              settleResolve({
                // Omdirigeringar följs INTE här. safeFetch eller browsern skapar
                // nästa request, som får en ny guarded socket-lookup.
                status: response.statusCode ?? 502,
                headers,
                body: decodedBody,
              });
            })
            .catch((error: unknown) => {
              settleReject(error instanceof Error ? error : new Error(String(error)));
            });
        });
      }

      request.setTimeout(timeoutMs, () => {
        request.destroy(new Error(`Pinned fetch timed out after ${timeoutMs} ms`));
      });
      request.on("error", settleReject);
      request.once("close", cleanup);

      if (init.signal?.aborted) {
        onAbort();
        return;
      }
      init.signal?.addEventListener("abort", onAbort, { once: true });

      if (body) request.write(body);
      request.end();
    });
  } finally {
    agent.destroy();
  }
}
