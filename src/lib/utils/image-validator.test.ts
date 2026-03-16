import { describe, expect, it } from "vitest";
import { extractImageRefs, type TextFile } from "./image-validator";

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
