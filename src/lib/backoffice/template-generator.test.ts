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
    const authRoute = generated.files.find(
      (file) => file.path === "app/api/backoffice/auth/route.ts",
    )?.content;
    expect(authRoute).toContain("const MAX_TRACKED_IPS = 10_000;");
    expect(authRoute).toContain('typeof (body as { password?: unknown }).password !== "string"');
  });

  it("matches the pre-split master output byte for byte", () => {
    const cases = [
      generateBackofficeFiles(emptyManifest),
      generateBackofficeFiles(emptyManifest, "säker-lösenfras"),
      generateBackofficeFiles(populatedManifest),
      generateBackofficeFiles(populatedManifest, "säker-lösenfras"),
    ];

    // Golden hashes for the complete generated artifact.
    // Change them only together with an intentional generator behavior change.
    expect(cases.map(digest)).toEqual([
      "db8eadbcddca10c3113baa90ee4b6940141e7456f07002815eebb1e73a7328fb",
      "4cc20cc51a56361aed4e47a792be83f456ea1d646117e15c403e36de424245ab",
      "8ec642e61d99c486fa5c433b921519fee40e7ecd4f1c92168023bf4cdae11960",
      "74eb446a604282c4965cf3f0eca4f656a73037ec94a97eccd8fc8353832516e3",
    ]);
  });
});
