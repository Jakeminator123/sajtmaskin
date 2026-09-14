import { describe, expect, it } from "vitest";
import {
  EXPORT_GUIDE_PATH,
  OwnerTransferSiteUrlRequiredError,
  buildOwnerTransferPackage,
} from "./owner-transfer-package";

describe("buildOwnerTransferPackage", () => {
  it("ships media bytes, rewrites their URL and documents an installable handoff", () => {
    const blobUrl =
      "https://store.public.blob.vercel-storage.com/user/projects/proj/media/hero.png";
    const files = buildOwnerTransferPackage({
      projectFiles: [
        {
          path: "package.json",
          content: JSON.stringify({
            engines: { node: ">=22.14.0 <23" },
            scripts: { build: "next build", dev: "next dev" },
          }),
          language: "json",
        },
        {
          path: "app/page.tsx",
          content: `const hero = "${blobUrl}";\nconst key = process.env.RESEND_API_KEY;`,
          language: "tsx",
        },
      ],
      media: [
        {
          id: 7,
          originalName: "Min hero.png",
          mimeType: "image/png",
          body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
          sourceUrls: [blobUrl],
        },
      ],
    });

    expect(files.find((file) => file.path === "app/page.tsx")?.content).toContain(
      "/media/7-Min-hero.png",
    );
    expect(files.find((file) => file.path === "public/media/7-Min-hero.png")?.content).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    expect(String(files.find((file) => file.path === "env.example")?.content)).toBe(
      "NEXT_PUBLIC_SITE_URL=\nRESEND_API_KEY=\n",
    );
    const guide = String(files.find((file) => file.path === EXPORT_GUIDE_PATH)?.content);
    expect(guide).toContain("npm install");
    expect(guide).toContain("npm run build");
    expect(guide).toContain("Resend (e-post)");
    expect(guide).toContain("Databasdata, domänregistrering");
  });

  it("requires a new origin before replacing a hardcoded hosted canonical", () => {
    const input = {
      projectFiles: [
        {
          path: "app/layout.tsx",
          content: `const canonical = "https://kund.sites.sajtmaskin.se/about";`,
          language: "tsx",
        },
      ],
      media: [],
    };

    expect(() => buildOwnerTransferPackage(input)).toThrow(OwnerTransferSiteUrlRequiredError);
    const files = buildOwnerTransferPackage({ ...input, siteUrl: "https://kund.se/" });
    const layout = String(files.find((file) => file.path === "app/layout.tsx")?.content);
    expect(layout).toContain("https://kund.se/about");
    expect(layout).not.toContain("sites.sajtmaskin.se");
  });

  it("preserves comments but never reintroduces env values", () => {
    const files = buildOwnerTransferPackage({
      projectFiles: [
        {
          path: "env.example",
          content: "# Required\nAPI_KEY=must-not-leak\n",
          language: "text",
        },
        {
          path: "app/page.tsx",
          content:
            'const region = process.env.CUSTOM_REGION; const token = process.env["BRACKET_TOKEN"];',
          language: "tsx",
        },
      ],
      media: [],
    });
    expect(String(files.find((file) => file.path === "env.example")?.content)).toBe(
      "# Required\nAPI_KEY=\nBRACKET_TOKEN=\nCUSTOM_REGION=\nNEXT_PUBLIC_SITE_URL=\n",
    );
    expect(JSON.stringify(files)).not.toContain("must-not-leak");
  });

  it("detects destructured process env and bracketed Vite env names", () => {
    const files = buildOwnerTransferPackage({
      projectFiles: [
        {
          path: "src/config.ts",
          content:
            "const { DATABASE_URL, API_TOKEN: token } = process.env; " +
            "const vite = import.meta.env['VITE_API_URL'];",
          language: "ts",
        },
      ],
      media: [],
    });

    expect(String(files.find((file) => file.path === "env.example")?.content)).toBe(
      "API_TOKEN=\nDATABASE_URL=\nNEXT_PUBLIC_SITE_URL=\nVITE_API_URL=\n",
    );
  });

  it("includes destructured Vite environment names without their values", () => {
    const files = buildOwnerTransferPackage({
      projectFiles: [
        {
          path: "src/config.ts",
          content: "const { VITE_API_URL, VITE_TOKEN: token } = import.meta.env;",
          language: "ts",
        },
      ],
      media: [],
    });

    expect(String(files.find((file) => file.path === "env.example")?.content)).toBe(
      "NEXT_PUBLIC_SITE_URL=\nVITE_API_URL=\nVITE_TOKEN=\n",
    );
    expect(String(files.find((file) => file.path === EXPORT_GUIDE_PATH)?.content)).toContain(
      "VITE_TOKEN",
    );
  });

  it("replaces only the exact persisted provider origin", () => {
    const input = {
      projectFiles: [
        {
          path: "app/sitemap.ts",
          content:
            'export default () => [{ url: "https://demo.vercel.app/" }, ' +
            '{ url: "https://demo.vercel.app.evil.example/" }, ' +
            '{ url: "https://third-party.vercel.app/" }];',
          language: "ts",
        },
      ],
      media: [],
      providerOrigin: "https://demo.vercel.app",
    };

    expect(() => buildOwnerTransferPackage(input)).toThrow(OwnerTransferSiteUrlRequiredError);
    const files = buildOwnerTransferPackage({ ...input, siteUrl: "https://kund.se" });
    const sitemap = String(files.find((file) => file.path === "app/sitemap.ts")?.content);
    expect(sitemap).toContain('url: "https://kund.se/"');
    expect(sitemap).toContain("https://demo.vercel.app.evil.example/");
    expect(sitemap).toContain("https://third-party.vercel.app/");
  });
});
