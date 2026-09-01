/**
 * Poängen med modulen är att INGEN annan än den själv slår upp värdnamnet.
 * Testerna kör därför mot en riktig lokal HTTP-server med `node:dns` mockad, så
 * uppslagning och anslutning kan observeras var för sig: rebinding simuleras
 * genom att adressen som returneras bedöms som privat trots att värdgrinden
 * redan sagt ja.
 */

import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isResolvedAddressPrivate = vi.hoisted(() => vi.fn());
const dnsLookup = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ssrf-address", () => ({ isResolvedAddressPrivate }));
// Node-inbyggda moduler importeras via default i den transpilerade koden, så
// mocken måste exponera både den namngivna och default-formen.
vi.mock("node:dns", () => {
  const mocked = { lookup: dnsLookup };
  return { ...mocked, default: mocked };
});

const { fetchWithPinnedDns, PINNED_ADDRESS_BLOCKED_MESSAGE } = await import("./pinned-fetch");

type ReceivedRequest = {
  url: string | undefined;
  method: string | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
};

let server: http.Server;
let port = 0;
let received: ReceivedRequest[] = [];

/** Svarar med en fast adress oavsett vilket namn som slås upp. */
function resolveTo(...addresses: string[]) {
  dnsLookup.mockImplementation(
    (
      _hostname: string,
      _options: unknown,
      callback: (err: Error | null, addresses: { address: string; family: number }[]) => void,
    ) => {
      callback(
        null,
        addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
      );
    },
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  received = [];
  isResolvedAddressPrivate.mockReturnValue(false);
  resolveTo("127.0.0.1");

  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      });
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "https://annanstans.example/next" });
        res.end();
        return;
      }
      if (req.url === "/headers") {
        res.writeHead(200, {
          "content-type": "text/plain",
          "set-cookie": ["a=1", "b=2"],
          "x-keep": "yes",
        });
        res.end("ok");
        return;
      }
      if (req.url === "/slow") {
        return;
      }
      if (req.url === "/gzip") {
        res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
        res.end(zlib.gzipSync(Buffer.from("gzip-body")));
        return;
      }
      if (req.url === "/br") {
        res.writeHead(200, { "content-type": "text/plain", "content-encoding": "br" });
        res.end(zlib.brotliCompressSync(Buffer.from("br-body")));
        return;
      }
      if (req.url === "/gzip-big") {
        res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
        res.end(zlib.gzipSync(Buffer.alloc(80, 97)));
        return;
      }
      res.writeHead(200, { "content-type": "image/png" });
      res.end("asset-bytes");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("fetchWithPinnedDns", () => {
  it("ansluter till den granskade adressen och behåller värdnamnet i Host", async () => {
    // Namnet står kvar i URL:en — det är skillnaden mot att skriva om URL:en
    // till en IP, som hade brutit TLS-cert och SNI.
    const result = await fetchWithPinnedDns(`http://asset.test:${port}/logo.png`);

    expect(result.status).toBe(200);
    expect(result.body.toString()).toBe("asset-bytes");
    expect(result.headers["content-type"]).toBe("image/png");
    expect(received).toHaveLength(1);
    expect(received[0].headers.host).toBe(`asset.test:${port}`);
  });

  it("stoppar en värd som svarar privat vid anslutningen", async () => {
    // Rebinding: värdgrinden hann se en publik adress, posten flippar innan
    // uppkopplingen. Utan pinning hade Playwrights egen hämtning anslutit ändå.
    isResolvedAddressPrivate.mockImplementation((address: string) => address === "127.0.0.1");

    await expect(fetchWithPinnedDns(`http://rebind.test:${port}/x`)).rejects.toThrow(
      PINNED_ADDRESS_BLOCKED_MESSAGE,
    );
    expect(received).toHaveLength(0);
  });

  it("stoppar när någon post i DNS-svaret pekar inåt", async () => {
    // Hela svaret prövas, inte bara posten socketen råkar välja.
    resolveTo("93.184.216.34", "127.0.0.1");
    isResolvedAddressPrivate.mockImplementation((address: string) => address === "127.0.0.1");

    await expect(fetchWithPinnedDns(`http://blandat.test:${port}/x`)).rejects.toThrow(
      PINNED_ADDRESS_BLOCKED_MESSAGE,
    );
    expect(received).toHaveLength(0);
  });

  it("stoppar privata IPv6-poster även när ett publikt IPv6-svar finns", async () => {
    resolveTo("2606:4700:4700::1111", "fe90::1");
    isResolvedAddressPrivate.mockImplementation((address: string) => address === "fe90::1");

    await expect(fetchWithPinnedDns(`http://ipv6-mix.test:${port}/x`)).rejects.toThrow(
      PINNED_ADDRESS_BLOCKED_MESSAGE,
    );
    expect(received).toHaveLength(0);
  });

  it("stoppar ett tomt DNS-svar", async () => {
    resolveTo();

    await expect(fetchWithPinnedDns(`http://tom.test:${port}/x`)).rejects.toThrow(
      PINNED_ADDRESS_BLOCKED_MESSAGE,
    );
    expect(received).toHaveLength(0);
  });

  it("för vidare uppslagsfel utan att ansluta", async () => {
    dnsLookup.mockImplementation(
      (_hostname: string, _options: unknown, callback: (err: Error) => void) => {
        callback(new Error("ENOTFOUND"));
      },
    );

    await expect(fetchWithPinnedDns(`http://okand.test:${port}/x`)).rejects.toThrow(/ENOTFOUND/);
    expect(received).toHaveLength(0);
  });

  it("tvingar identity, sätter Host själv och släpper hop-by-hop-headers", async () => {
    await fetchWithPinnedDns(`http://asset.test:${port}/logo.png`, {
      headers: {
        "accept-encoding": "gzip, br",
        host: "forfalskad.example",
        "transfer-encoding": "chunked",
        "x-custom": "1",
      },
    });

    expect(received[0].headers["accept-encoding"]).toBe("identity");
    expect(received[0].headers.host).toBe(`asset.test:${port}`);
    expect(received[0].headers["transfer-encoding"]).toBeUndefined();
    expect(received[0].headers["x-custom"]).toBe("1");
  });

  it("skickar med metod och kropp", async () => {
    await fetchWithPinnedDns(`http://asset.test:${port}/submit`, {
      method: "POST",
      body: Buffer.from("payload"),
    });

    expect(received[0].method).toBe("POST");
    expect(received[0].body).toBe("payload");
    expect(received[0].headers["content-length"]).toBe("7");
  });

  it("släpper set-cookie och content-length ur svaret men behåller resten", async () => {
    const result = await fetchWithPinnedDns(`http://asset.test:${port}/headers`);

    expect(result.headers["x-keep"]).toBe("yes");
    expect(result.headers["set-cookie"]).toBeUndefined();
    expect(result.headers["content-length"]).toBeUndefined();
  });

  it("följer inte omdirigeringar utan lämnar tillbaka den råa 3xx:an", async () => {
    // Nästa hopp måste utfärdas av browsern så det går genom grinden igen.
    const result = await fetchWithPinnedDns(`http://asset.test:${port}/redirect`);

    expect(result.status).toBe(302);
    expect(result.headers.location).toBe("https://annanstans.example/next");
    expect(received).toHaveLength(1);
  });

  it("avbryter ett svar som växer över taket", async () => {
    await expect(
      fetchWithPinnedDns(`http://asset.test:${port}/logo.png`, { maxBodyBytes: 2 }),
    ).rejects.toThrow(/exceeded 2 bytes/);
  });

  it("vägrar allt som inte är http(s)", async () => {
    await expect(fetchWithPinnedDns("ftp://asset.test/x")).rejects.toThrow(/http\(s\) only/);
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("avkodar gzip så body-läsning ger klartext", async () => {
    const result = await fetchWithPinnedDns(`http://asset.test:${port}/gzip`);
    expect(result.body.toString()).toBe("gzip-body");
    expect(result.headers["content-encoding"]).toBeUndefined();
  });

  it("avkodar brotli så body-läsning ger klartext", async () => {
    const result = await fetchWithPinnedDns(`http://asset.test:${port}/br`);
    expect(result.body.toString()).toBe("br-body");
    expect(result.headers["content-encoding"]).toBeUndefined();
  });

  it("fail-stänger när avkodad body passerar maxBodyBytes", async () => {
    await expect(
      fetchWithPinnedDns(`http://asset.test:${port}/gzip-big`, { maxBodyBytes: 16 }),
    ).rejects.toThrow(/exceeded 16 bytes/);
  });

  it("avbryter när AbortSignal abortas mitt i ett hängande svar", async () => {
    const controller = new AbortController();
    const pending = fetchWithPinnedDns(`http://asset.test:${port}/slow`, {
      signal: controller.signal,
      timeoutMs: 5_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("timeoutar genom den pinnade transporten när servern inte svarar", async () => {
    await expect(
      fetchWithPinnedDns(`http://asset.test:${port}/slow`, { timeoutMs: 40 }),
    ).rejects.toThrow(/timed out/);
  });
});
