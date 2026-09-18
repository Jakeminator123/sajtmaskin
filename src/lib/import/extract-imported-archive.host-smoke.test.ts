import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import {
  encodeImportedBinaryContent,
  extractImportedFilesFromZip,
} from "./extract-imported-archive";

const require = createRequire(import.meta.url);
const { validateStartPayload } = require("../../../preview-host/src/validate.js") as {
  validateStartPayload: (payload: unknown) => { filesJson: Record<string, string> };
};
const { writeFilesIntoWorkspace } = require("../../../preview-host/src/runtime/workspace-files.js") as {
  writeFilesIntoWorkspace: (workspaceDir: string, filesJson: Record<string, string>) => string;
};

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wAAAQEB/9k=",
  "base64",
);
const WOFF2_STUB = Buffer.concat([Buffer.from("wOF2", "ascii"), Buffer.alloc(24, 7)]);

const PAGE = `export default function Page() {
  return (
    <main>
      <img src="/logo.png" alt="Logo" />
      <img src="/hero.jpg" alt="Hero" />
    </main>
  );
}
`;
const CSS = `@font-face {
  font-family: Site;
  src: url("/fonts/site.woff2") format("woff2");
}
body { font-family: Site, sans-serif; }
`;
const LAYOUT = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
`;

async function buildFixtureZip(files: Record<string, string | Buffer>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("import ZIP → persist → preview-host → reopen", () => {
  const workspaces: string[] = [];

  afterEach(() => {
    for (const dir of workspaces.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps png/jpg/woff2 through persist, host start, materialize and re-import", async () => {
    const zip = await buildFixtureZip({
      "site/app/page.tsx": PAGE,
      "site/app/layout.tsx": LAYOUT,
      "site/app/globals.css": CSS,
      "site/package.json": '{ "name": "import-binary-smoke", "private": true }',
      "site/public/logo.png": PNG_1X1,
      "site/public/hero.jpg": JPEG_1X1,
      "site/public/fonts/site.woff2": WOFF2_STUB,
    });

    const imported = await extractImportedFilesFromZip(zip);
    const byPath = Object.fromEntries(imported.map((file) => [file.path, file]));
    expect(byPath["public/logo.png"]?.language).toBe("binary");
    expect(byPath["public/hero.jpg"]?.language).toBe("binary");
    expect(byPath["public/fonts/site.woff2"]?.language).toBe("binary");
    expect(byPath["app/page.tsx"]?.content).toContain("/logo.png");
    expect(byPath["app/globals.css"]?.content).toContain("/fonts/site.woff2");

    const persistedJson = JSON.stringify(imported);
    const reopened = JSON.parse(persistedJson) as typeof imported;
    expect(reopened.find((file) => file.path === "public/logo.png")?.content).toBe(
      encodeImportedBinaryContent(PNG_1X1),
    );
    expect(reopened.find((file) => file.path === "public/hero.jpg")?.content).toBe(
      encodeImportedBinaryContent(JPEG_1X1),
    );
    expect(reopened.find((file) => file.path === "public/fonts/site.woff2")?.content).toBe(
      encodeImportedBinaryContent(WOFF2_STUB),
    );

    const filesJson = Object.fromEntries(reopened.map((file) => [file.path, file.content]));
    const validated = validateStartPayload({
      chatId: "chat_import_binary_smoke",
      versionId: "ver_import_binary_smoke",
      filesJson,
    });
    expect(validated.filesJson["public/logo.png"]).toBe(encodeImportedBinaryContent(PNG_1X1));

    const workspaceDir = mkdtempSync(join(tmpdir(), "import-binary-smoke-"));
    workspaces.push(workspaceDir);
    writeFilesIntoWorkspace(workspaceDir, validated.filesJson);
    expect(readFileSync(join(workspaceDir, "public/logo.png"))).toEqual(PNG_1X1);
    expect(readFileSync(join(workspaceDir, "public/hero.jpg"))).toEqual(JPEG_1X1);
    expect(readFileSync(join(workspaceDir, "public/fonts/site.woff2"))).toEqual(WOFF2_STUB);
    expect(readFileSync(join(workspaceDir, "app/page.tsx"), "utf8")).toContain("/logo.png");

    const reimportZip = await buildFixtureZip(
      Object.fromEntries(
        reopened.map((file) => [
          `site/${file.path}`,
          file.language === "binary" ? Buffer.from(file.content, "utf8") : file.content,
        ]),
      ),
    );
    const reimported = await extractImportedFilesFromZip(reimportZip);
    expect(reimported.find((file) => file.path === "public/logo.png")?.content).toBe(
      encodeImportedBinaryContent(PNG_1X1),
    );
    expect(reimported.find((file) => file.path === "public/hero.jpg")?.content).toBe(
      encodeImportedBinaryContent(JPEG_1X1),
    );
    expect(reimported.find((file) => file.path === "public/fonts/site.woff2")?.content).toBe(
      encodeImportedBinaryContent(WOFF2_STUB),
    );
    expect(reimported.filter((file) => file.content.includes("base64:base64:"))).toEqual([]);
  });
});
