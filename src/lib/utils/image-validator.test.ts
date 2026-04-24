import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractImageRefs, validateImages, type TextFile } from "./image-validator";

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
        (call) => (call[1] as RequestInit | undefined)?.method === "GET",
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
});
