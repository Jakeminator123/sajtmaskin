import { describe, expect, it } from "vitest";
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
