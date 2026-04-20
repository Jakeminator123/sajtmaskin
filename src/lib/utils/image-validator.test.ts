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
