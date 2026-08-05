import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ContentManifest } from "./content-extractor";
import { generateBackofficeFiles } from "./template-generator";

const emptyManifest: ContentManifest = {
  version: "1",
  siteType: "website",
  extractedAt: "2026-08-05T00:00:00.000Z",
  content: [],
  products: [],
  colors: {
    primary: "#000000",
    secondary: "#111111",
    accent: "#222222",
    background: "#ffffff",
    text: "#333333",
  },
  metadata: {
    hasContactForm: false,
    hasNewsletter: false,
    hasProducts: false,
    pageCount: 1,
  },
};

const populatedManifest: ContentManifest = {
  version: "2",
  siteType: "website",
  extractedAt: "2026-08-05T00:00:00.000Z",
  content: [
    {
      id: "hero-title",
      type: "text",
      value: "Hej världen",
      context: "hero",
    },
    {
      id: "hero-image",
      type: "image",
      value: "/hero.jpg",
      context: "hero",
    },
  ],
  products: [
    {
      id: "p1",
      name: "Ångbåt",
      description: "Demo",
      price: "123 kr",
      image: "/boat.jpg",
      category: "Båtar",
    },
  ],
  colors: {
    primary: "#00ffaa",
    secondary: "#112233",
    accent: "#ff00aa",
    background: "#020617",
    text: "#f8fafc",
  },
  metadata: {
    title: "Paritet",
    hasContactForm: true,
    hasNewsletter: true,
    hasProducts: true,
    pageCount: 3,
  },
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

describe("generateBackofficeFiles", () => {
  it("keeps the generated file contract stable", () => {
    const generated = generateBackofficeFiles(populatedManifest, "säker-lösenfras");

    expect(generated.files.map((file) => file.path)).toEqual([
      "app/backoffice/page.tsx",
      "app/backoffice/layout.tsx",
      "app/backoffice/dashboard/page.tsx",
      "app/backoffice/content/page.tsx",
      "app/backoffice/images/page.tsx",
      "app/backoffice/colors/page.tsx",
      "app/api/backoffice/auth/route.ts",
      "app/api/backoffice/_lib/storage.ts",
      "app/api/backoffice/content/route.ts",
      "app/api/backoffice/colors/route.ts",
      "data/manifest.json",
    ]);
    expect(generated.envExample).toContain("BACKOFFICE_PASSWORD=säker-lösenfras");
    expect(generated.setupInstructions).toContain("lösenordet är redan satt");
  });

  it("matches the pre-split master output byte for byte", () => {
    const cases = [
      generateBackofficeFiles(emptyManifest),
      generateBackofficeFiles(emptyManifest, "säker-lösenfras"),
      generateBackofficeFiles(populatedManifest),
      generateBackofficeFiles(populatedManifest, "säker-lösenfras"),
    ];

    // Golden hashes from the unsplit implementation on master eb7b1cc.
    // Change them only together with an intentional generator behavior change.
    expect(cases.map(digest)).toEqual([
      "6632714599f26ea5f39d8f4faf4deed695d7c3b2f43b44672d6ae8802a082cdd",
      "519d9af0b7d99bdd3c3c10d4bcc63c616ea29e0d1bf893263f83cff21a150740",
      "43371df00ea434947ce90b0c983df1a570edf31deb6049081ee8e1754209cc2b",
      "450836aee47bf989d54804c660781240dd07f4a0a379ae61bc2d759865b3153b",
    ]);
  });
});
