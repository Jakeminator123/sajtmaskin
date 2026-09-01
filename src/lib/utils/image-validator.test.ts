import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyKnownImageReplacementsToFiles,
  buildKnownImageReplacementMap,
  coerceKnownImageReplacementMap,
  extractImageRefs,
  KNOWN_IMAGE_REPLACEMENTS_MAX_ENTRIES,
  unwrapNextImageUrl,
  validateImages,
  type BrokenImage,
  type TextFile,
} from "./image-validator";

describe("unwrapNextImageUrl", () => {
  const rawUnsplash = "https://images.unsplash.com/photo-123?w=1200&h=800&fit=crop";
  const encodedRaw = encodeURIComponent(rawUnsplash);

  it("packar upp en relativ /_next/image-wrapper utan origin", () => {
    expect(
      unwrapNextImageUrl(`/_next/image?url=${encodedRaw}&w=828&q=75`),
    ).toBe(rawUnsplash);
  });

  it("packar upp en absolut host/_next/image-wrapper", () => {
    expect(
      unwrapNextImageUrl(
        `https://preview.example.com/_next/image?url=${encodedRaw}&w=828&q=75`,
      ),
    ).toBe(rawUnsplash);
  });

  it("ger null utan att kasta när query saknas", () => {
    expect(unwrapNextImageUrl("/_next/image")).toBeNull();
    expect(unwrapNextImageUrl("https://preview.example.com/_next/image")).toBeNull();
  });

  it("ger null för en URL som inte är next/image-wrapper", () => {
    expect(unwrapNextImageUrl("https://cdn.example.com/hero.jpg")).toBeNull();
    expect(unwrapNextImageUrl("/images/hero.jpg")).toBeNull();
  });

  it("förstör inte en redan avkodad / rå Unsplash-URL", () => {
    expect(unwrapNextImageUrl(rawUnsplash)).toBeNull();
    expect(unwrapNextImageUrl(decodeURIComponent(encodedRaw))).toBe(null);
  });

  it("träffar inte /_next/image-foo (exakt path-segment, inte substring)", () => {
    expect(
      unwrapNextImageUrl(`/_next/image-foo?url=${encodedRaw}&w=828&q=75`),
    ).toBeNull();
  });

  it("kastar aldrig på konstiga värden", () => {
    const weird: unknown[] = [
      "",
      " ",
      "???",
      "http://",
      "not a url",
      "/_next/image?url=",
      "/_next/image?url=%",
      "/_next/image?url=%E0%A4%A",
      "%",
      "//",
      "\n",
      `/_next/image?url=${"x".repeat(10_000)}`,
      "file:///_next/image?url=foo",
      null,
      undefined,
      0,
      {},
      [],
      true,
    ];
    for (const value of weird) {
      expect(() => unwrapNextImageUrl(value as string)).not.toThrow();
    }
  });
});

describe("extractImageRefs", () => {
  it("extracts CSS background-image urls", () => {
    const files: TextFile[] = [
      {
        name: "app/page.tsx",
        content: `
          export default function Page() {
            return (
              <div style={{ backgroundImage: 'url("https://images.unsplash.com/photo-123?w=1200")' }}>
                Hello
              </div>
            );
          }
        `,
      },
    ];

    expect(extractImageRefs(files)).toEqual([
      {
        url: "https://images.unsplash.com/photo-123?w=1200",
        alt: "",
        file: "app/page.tsx",
      },
    ]);
  });

  // SAJ-18 / A3: source.unsplash.com was shut down in mid-2024.
  it("flags source.unsplash.com URLs as broken without HEAD round-trip", async () => {
    const files: TextFile[] = [
      {
        name: "app/page.tsx",
        content: `
          export default function Page() {
            return (
              <>
                <img src="https://source.unsplash.com/random/800x600?hotel" alt="hotel exterior" />
                <img src="https://source.unsplash.com/featured/?ocean" alt="ocean view" />
              </>
            );
          }
        `,
      },
    ];

    const result = await validateImages({
      files,
      autoFix: false,
      unsplashAccessKey: null, // No replacements possible without key, but detection should still fire.
    });

    expect(result.broken).toHaveLength(2);
    for (const b of result.broken) {
      expect(b.status).toBe(410);
      expect(b.url).toContain("source.unsplash.com");
    }
  });

  it("does not treat JavaScript URL constructors as image refs", () => {
    const files: TextFile[] = [
      {
        name: "app/layout.tsx",
        content: `
          import type { Metadata } from "next";

          export const metadata: Metadata = {
            metadataBase: new URL("https://james-fall.vercel.app"),
            openGraph: {
              images: ["https://images.unsplash.com/photo-456?w=1200"],
            },
          };
        `,
      },
    ];

    expect(extractImageRefs(files)).toEqual([]);
  });
});

describe("validateImages", () => {
  it("applies known dead Unsplash replacements without network calls", () => {
    const deadUrl =
      "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1200&h=800&fit=crop";
    const replacementUrl =
      "https://images.unsplash.com/photo-1647164789794?w=1200&h=800&fit=crop";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = applyKnownImageReplacementsToFiles(
      [
        {
          name: "app/page.tsx",
          content: `<img src="${deadUrl}" alt="Neon glassblowing studio" />`,
        },
      ],
      { [deadUrl]: replacementUrl },
    );

    expect(result.replacedCount).toBe(1);
    expect(result.files[0]?.content).toContain(replacementUrl);
    expect(result.files[0]?.content).not.toContain(deadUrl);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  // Codex/VADE P2 (PR #376 round 2): only DEFINITIVELY dead statuses
  // (404/410) may be cached permanently. Transient failures (network
  // "error", 5xx, 429) can be replaced in the pass but never persisted —
  // the heal path applies the map without re-checking the network.
  describe("buildKnownImageReplacementMap — transient vs definitively dead", () => {
    const brokenEntry = (
      status: number | "error",
      overrides: Partial<BrokenImage> = {},
    ): BrokenImage => ({
      url: "https://images.unsplash.com/photo-dead?w=800",
      alt: "Studio",
      file: "app/page.tsx",
      status,
      replacementUrl: "https://images.unsplash.com/photo-live?w=800",
      ...overrides,
    });

    it("persists 404 and 410 entries", () => {
      const map = buildKnownImageReplacementMap([
        brokenEntry(404),
        brokenEntry(410, { url: "https://source.unsplash.com/random/800x600?x" }),
      ]);
      expect(Object.keys(map)).toHaveLength(2);
    });

    it("does NOT persist transient failures (timeout/error, 503, 429, 500)", () => {
      const map = buildKnownImageReplacementMap([
        brokenEntry("error"),
        brokenEntry(503),
        brokenEntry(429),
        brokenEntry(500),
      ]);
      expect(map).toEqual({});
    });

    // Codex P2 #4 (PR #376 round 2): Unsplash-search miss leaves
    // replacementUrl null while autoFix wrote the deterministic placeholder —
    // persist the same dead→placeholder mapping (dead statuses only).
    it("persists the placeholder fallback for definitively dead URLs without a search replacement", () => {
      const map = buildKnownImageReplacementMap([
        brokenEntry(404, { replacementUrl: null, alt: "Porträtt av Emilia" }),
      ]);
      expect(map["https://images.unsplash.com/photo-dead?w=800"]).toBe(
        "/api/placeholder?w=1200&h=800&label=Portr%C3%A4tt%20av%20Emilia",
      );
    });

    it("does NOT persist a placeholder fallback for transient failures", () => {
      const map = buildKnownImageReplacementMap([
        brokenEntry("error", { replacementUrl: null }),
      ]);
      expect(map).toEqual({});
    });
  });

  // Bugbot MEDIUM (PR #376): the per-chat map is capped so it cannot grow
  // unboundedly across a long-lived chat; overflow evicts the OLDEST entry.
  it("caps the known-replacement map at the max and evicts the oldest entry on overflow", () => {
    const input: Record<string, string> = {};
    for (let i = 0; i < KNOWN_IMAGE_REPLACEMENTS_MAX_ENTRIES + 1; i++) {
      input[`https://images.unsplash.com/photo-dead-${i}?w=800`] =
        `https://images.unsplash.com/photo-live-${i}?w=800`;
    }

    const capped = coerceKnownImageReplacementMap(input);

    expect(Object.keys(capped)).toHaveLength(KNOWN_IMAGE_REPLACEMENTS_MAX_ENTRIES);
    // Entry 0 is the oldest (first inserted) and must be evicted…
    expect(capped["https://images.unsplash.com/photo-dead-0?w=800"]).toBeUndefined();
    // …while the newest entry survives.
    expect(
      capped[
        `https://images.unsplash.com/photo-dead-${KNOWN_IMAGE_REPLACEMENTS_MAX_ENTRIES}?w=800`
      ],
    ).toBe(
      `https://images.unsplash.com/photo-live-${KNOWN_IMAGE_REPLACEMENTS_MAX_ENTRIES}?w=800`,
    );
  });

  it("adds duplicate_alt warning for repeated descriptive alt texts", async () => {
    const files: TextFile[] = [
      {
        name: "app/page.tsx",
        content: `
          export default function Page() {
            return (
              <>
                <img src="https://cdn.example.com/a.jpg" alt="Porträtt av teammedlem i studio" />
                <img src="https://cdn.example.com/b.jpg" alt="porträtt av teammedlem i studio" />
              </>
            );
          }
        `,
      },
    ];

    const result = await validateImages({
      files,
      autoFix: false,
      unsplashAccessKey: null,
      skipUrls: new Set([
        "https://cdn.example.com/a.jpg",
        "https://cdn.example.com/b.jpg",
      ]),
    });

    expect(result.warnings).toContain(
      '[duplicate_alt] Alt-text "porträtt av teammedlem i studio" repeats 2 times — gallery items should be unique',
    );
  });

  // Wave 3 / R5 — HEAD/GET-fallback för CDN:er som inte tillåter HEAD
  describe("HEAD/GET-fallback", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    const filesForUrl = (url: string): TextFile[] => [
      {
        name: "app/page.tsx",
        content: `
          export default function Page() {
            return <img src="${url}" alt="Test" />;
          }
        `,
      },
    ];

    it("HEAD-verifierar Unsplash-ersättning och tar nästa kandidat vid 404", async () => {
      const deadUrl = "https://images.unsplash.com/photo-original-broken?w=800";
      fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("api.unsplash.com")) {
          return new Response(
            JSON.stringify({
              results: [
                { id: "1", urls: { raw: "https://images.unsplash.com/photo-dead-candidate" } },
                { id: "2", urls: { raw: "https://images.unsplash.com/photo-live-candidate" } },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes("photo-original-broken") || url.includes("photo-dead-candidate")) {
          return new Response(null, { status: 404 });
        }
        if (url.includes("photo-live-candidate")) {
          return new Response(null, { status: 200 });
        }
        return new Response(null, { status: 404 });
      });

      const result = await validateImages({
        files: filesForUrl(deadUrl),
        autoFix: true,
        unsplashAccessKey: "test-key",
      });

      expect(result.replacedCount).toBe(1);
      expect(result.files[0]?.content).toContain("photo-live-candidate");
      expect(result.files[0]?.content).not.toContain("photo-dead-candidate");
      expect(result.files[0]?.content).not.toContain("photo-original-broken");
    });

    it("onlyUrls begränsar kontrollen till den angivna URL:en", async () => {
      fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("keep-me")) return new Response(null, { status: 200 });
        return new Response(null, { status: 404 });
      });

      const result = await validateImages({
        files: [
          {
            name: "app/page.tsx",
            content: `
              <img src="https://cdn.example.com/keep-me.jpg" alt="Behåll" />
              <img src="https://cdn.example.com/drop-me.jpg" alt="Byt" />
            `,
          },
        ],
        autoFix: false,
        unsplashAccessKey: null,
        onlyUrls: ["https://cdn.example.com/drop-me.jpg"],
      });

      expect(result.broken).toHaveLength(1);
      expect(result.broken[0]?.url).toBe("https://cdn.example.com/drop-me.jpg");
      expect(fetchSpy.mock.calls.some((call: unknown[]) => String(call[0]).includes("keep-me"))).toBe(
        false,
      );
    });

    // Produktkontrollen rapporterar `img.currentSrc`, som på next/image-scaffolds
    // (ecommerce, portfolio) är `/_next/image?url=…` medan filen har rå-URL:en.
    // Utan uppackning blev den skopade bildfixen en tyst no-op på default-sajterna.
    it("onlyUrls matchar en browser-upplöst /_next/image-URL mot källfilens rå-URL", async () => {
      const rawUrl = "https://images.unsplash.com/photo-broken?w=1200";
      fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));

      const result = await validateImages({
        files: [
          {
            name: "app/page.tsx",
            content: `<Image src="${rawUrl}" alt="Hero" width={1200} height={800} />`,
          },
        ],
        autoFix: false,
        unsplashAccessKey: null,
        onlyUrls: [
          `https://preview.example.com/_next/image?url=${encodeURIComponent(rawUrl)}&w=828&q=75`,
        ],
      });

      expect(result.broken).toHaveLength(1);
      expect(result.broken[0]?.url).toBe(rawUrl);
    });

    it("HEAD 200 → ingen broken (1 fetch-anrop, bara HEAD)", async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
      const result = await validateImages({
        files: filesForUrl("https://cdn.example.com/ok.jpg"),
        autoFix: false,
        unsplashAccessKey: null,
      });
      expect(result.broken).toHaveLength(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" });
    });

    it("HEAD 404 → broken (ingen GET-fallback för 4xx-status)", async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));
      const result = await validateImages({
        files: filesForUrl("https://cdn.example.com/missing.jpg"),
        autoFix: false,
        unsplashAccessKey: null,
      });
      expect(result.broken).toHaveLength(1);
      expect(result.broken[0]?.status).toBe(404);
      // 404 ska inte trigga GET-fallback. headCheck-retry kan dock ge en
      // till HEAD-call vid >=500 — men 404 räknas som "definitivt broken".
      const getCalls = fetchSpy.mock.calls.filter(
        (call: unknown[]) => (call[1] as RequestInit | undefined)?.method === "GET",
      );
      expect(getCalls).toHaveLength(0);
    });

    it("HEAD 405 → GET-fallback med Range bytes=0-1023 körs", async () => {
      fetchSpy
        .mockResolvedValueOnce(new Response(null, { status: 405 }))
        .mockResolvedValue(new Response(null, { status: 200 }));
      const result = await validateImages({
        files: filesForUrl("https://cdn-noheader.example.com/img.jpg"),
        autoFix: false,
        unsplashAccessKey: null,
      });
      expect(result.broken).toHaveLength(0);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" });
      expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
        method: "GET",
        headers: expect.objectContaining({ Range: "bytes=0-1023" }),
      });
    });

    it("HEAD 501 → GET-fallback körs (samma kodväg som 405)", async () => {
      fetchSpy
        .mockResolvedValueOnce(new Response(null, { status: 501 }))
        .mockResolvedValue(new Response(null, { status: 206 }));
      const result = await validateImages({
        files: filesForUrl("https://cdn-501.example.com/img.jpg"),
        autoFix: false,
        unsplashAccessKey: null,
      });
      expect(result.broken).toHaveLength(0);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
    });

    it("HEAD 405 + GET 404 → fortfarande broken", async () => {
      fetchSpy
        .mockResolvedValueOnce(new Response(null, { status: 405 }))
        .mockResolvedValue(new Response(null, { status: 404 }));
      const result = await validateImages({
        files: filesForUrl("https://cdn-no-method-no-file.example.com/x.jpg"),
        autoFix: false,
        unsplashAccessKey: null,
      });
      expect(result.broken).toHaveLength(1);
      expect(result.broken[0]?.status).toBe(404);
    });
  });

  it("replaces unreplaced broken images with placeholder URL", async () => {
    const files: TextFile[] = [
      {
        name: "app/page.tsx",
        content: `
          export default function Page() {
            return (
              <img src="https://source.unsplash.com/random/1200x800?portrait" alt="Porträtt av Emilia Eberg" />
            );
          }
        `,
      },
    ];

    const result = await validateImages({
      files,
      autoFix: true,
      unsplashAccessKey: null,
    });

    expect(result.replacedCount).toBe(1);
    expect(result.files[0]?.content).toContain(
      "/api/placeholder?w=1200&h=800&label=Portr%C3%A4tt%20av%20Emilia%20Eberg",
    );
  });

  // Prod 2026-08-08 (flugfiske-sajten): en död static-map-URL gav varningen
  // "Ersatte 1 trasig(a) bild-URL:er med tillgängliga ersättningar" trots att
  // ersättningen var den grå platshållaren — sidan hade fortfarande ingen
  // karta. En platshållare är en degradering, inte en lagad bild, och
  // varningstexten måste säga det.
  it("kallar en platshållare för en platshållare, inte en 'tillgänglig ersättning'", async () => {
    const files: TextFile[] = [
      {
        name: "app/page.tsx",
        content:
          '<img src="https://staticmap.example.invalid/staticmap.php?center=65.5903,19.1668" alt="Karta över Arvidsjaur" />',
      },
    ];

    const result = await validateImages({
      files,
      autoFix: true,
      unsplashAccessKey: null,
    });

    expect(result.replacedCount).toBe(1);
    expect(result.warnings).toContain(
      "Ersatte 1 trasig(a) bild-URL:er med platshållare — ingen ersättningsbild hittades.",
    );
    expect(result.warnings).not.toContain(
      "Ersatte 1 trasig(a) bild-URL:er med tillgängliga ersättningar.",
    );
  });

  // SM-063: generatorn skriver rot-relativa src mot assets som aldrig
  // materialiseras. Detektionen ägs av project-sanity; autofix-punkten är
  // validateImages (samma /validate-images-steg som döda externa URL:er).
  describe("dangling root-relative assets (SM-063)", () => {
    it("rewrites a missing /images/hero-sky.jpg to the scaffold placeholder", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const files: TextFile[] = [
        {
          name: "app/page.tsx",
          content: '<img src="/images/hero-sky.jpg" alt="Himmel över viken" />',
        },
      ];

      const result = await validateImages({
        files,
        autoFix: true,
        unsplashAccessKey: null,
      });

      expect(result.replacedCount).toBe(1);
      expect(result.broken).toEqual([
        expect.objectContaining({
          url: "/images/hero-sky.jpg",
          alt: "Himmel över viken",
          file: "app/page.tsx",
          status: 404,
        }),
      ]);
      expect(result.files[0]?.content).toContain(
        "/api/placeholder?w=1200&h=800&label=Himmel%20%C3%B6ver%20viken",
      );
      expect(result.files[0]?.content).not.toContain("/images/hero-sky.jpg");
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("leaves a local src that exists in public/ untouched", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const files: TextFile[] = [
        {
          name: "app/page.tsx",
          content: '<img src="/images/hero-sky.jpg" alt="Himmel över viken" />',
        },
        {
          name: "public/images/hero-sky.jpg",
          content: "fake-bytes",
        },
      ];

      const result = await validateImages({
        files,
        autoFix: true,
        unsplashAccessKey: null,
      });

      expect(result.broken).toEqual([]);
      expect(result.replacedCount).toBe(0);
      expect(result.files[0]?.content).toContain('src="/images/hero-sky.jpg"');
      expect(result.files[0]?.content).not.toContain("/api/placeholder");
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("consumes a query suffix so the placeholder URL stays well-formed", async () => {
      const files: TextFile[] = [
        {
          name: "app/page.tsx",
          content: '<img src="/images/hero-sky.jpg?v=2" alt="Himmel" />',
        },
      ];

      const result = await validateImages({
        files,
        autoFix: true,
        unsplashAccessKey: null,
      });

      expect(result.replacedCount).toBe(1);
      expect(result.broken[0]?.url).toBe("/images/hero-sky.jpg?v=2");
      expect(result.files[0]?.content).toContain(
        "/api/placeholder?w=1200&h=800&label=Himmel",
      );
      expect(result.files[0]?.content).not.toContain("/images/hero-sky.jpg");
      expect(result.files[0]?.content).not.toMatch(/\/api\/placeholder\?[^"']*\?v=2/);
    });

    it("does not rewrite a remote URL that only contains the dangling path as a suffix", async () => {
      const files: TextFile[] = [
        {
          name: "app/page.tsx",
          content: [
            '<img src="/images/hero-sky.jpg" alt="Lokal" />',
            '<img src="https://cdn.example.com/images/hero-sky.jpg" alt="Remote" />',
          ].join("\n"),
        },
      ];

      const result = await validateImages({
        files,
        autoFix: true,
        unsplashAccessKey: null,
        skipUrls: new Set(["https://cdn.example.com/images/hero-sky.jpg"]),
      });

      expect(result.files[0]?.content).toContain(
        'src="https://cdn.example.com/images/hero-sky.jpg"',
      );
      expect(result.files[0]?.content).not.toContain('src="/images/hero-sky.jpg"');
      expect(result.files[0]?.content).toContain("/api/placeholder?w=1200&h=800&label=Lokal");
    });

    it("replaces the queried literal before the bare path in the same file", async () => {
      const files: TextFile[] = [
        {
          name: "app/page.tsx",
          content: [
            '<img src="/images/hero-sky.jpg" alt="Bar" />',
            '<img src="/images/hero-sky.jpg?v=2" alt="Versionerad" />',
          ].join("\n"),
        },
      ];

      const result = await validateImages({
        files,
        autoFix: true,
        unsplashAccessKey: null,
      });

      expect(result.replacedCount).toBe(2);
      expect(result.files[0]?.content).toContain(
        "/api/placeholder?w=1200&h=800&label=Bar",
      );
      expect(result.files[0]?.content).toContain(
        "/api/placeholder?w=1200&h=800&label=Versionerad",
      );
      expect(result.files[0]?.content).not.toContain("/images/hero-sky.jpg");
      expect(result.files[0]?.content).not.toMatch(/\/api\/placeholder\?[^"']*\?v=2/);
    });

    it("keeps each file's own alt when the same missing path appears twice", async () => {
      const files: TextFile[] = [
        {
          name: "components/hero.tsx",
          content: '<img src="/images/hero-sky.jpg" alt="Solnedgång" />',
        },
        {
          name: "components/footer.tsx",
          content: '<img src="/images/hero-sky.jpg" alt="Logotyp" />',
        },
      ];

      const result = await validateImages({
        files,
        autoFix: true,
        unsplashAccessKey: null,
      });

      const hero = result.files.find((file) => file.name === "components/hero.tsx");
      const footer = result.files.find((file) => file.name === "components/footer.tsx");
      expect(hero?.content).toContain(
        "/api/placeholder?w=1200&h=800&label=Solnedg%C3%A5ng",
      );
      expect(footer?.content).toContain(
        "/api/placeholder?w=1200&h=800&label=Logotyp",
      );
      expect(hero?.content).not.toContain("Logotyp");
      expect(footer?.content).not.toContain("Solnedg");
    });

    it("reports dangling locals without rewriting when autoFix is false", async () => {
      const files: TextFile[] = [
        {
          name: "app/page.tsx",
          content: '<img src="/images/hero-sky.jpg" alt="Himmel" />',
        },
      ];

      const result = await validateImages({
        files,
        autoFix: false,
        unsplashAccessKey: null,
      });

      expect(result.replacedCount).toBe(0);
      expect(result.broken).toHaveLength(1);
      expect(result.files[0]?.content).toContain("/images/hero-sky.jpg");
    });
  });
});
