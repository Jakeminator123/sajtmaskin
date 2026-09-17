import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { isNonTextContentFile } from "@/lib/gen/context/file-context-builder";
import {
  decodeImportedBinaryContent,
  decodeLocalZipContent,
  encodeImportedBinaryContent,
  extractImportedFilesFromZip,
  normalizeImportedBinaryBytes,
  normalizeImportedPath,
} from "./extract-imported-archive";
import { MAX_LOCAL_ZIP_UPLOAD_BYTES } from "./import-init-contract";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const WOFF2_STUB = Buffer.concat([Buffer.from("wOF2", "ascii"), Buffer.alloc(24, 7)]);

function materializePreviewHostBinary(content: string): Buffer {
  const prefix = "base64:";
  const decoded = Buffer.from(content.slice(prefix.length), "base64");
  const legacy = decoded.toString("utf8");
  if (!legacy.startsWith(prefix)) return decoded;
  const nested = Buffer.from(legacy.slice(prefix.length), "base64");
  return nested.length > 0 ? nested : decoded;
}

describe("normalizeImportedPath", () => {
  it("drops traversal and blocked prefixes", () => {
    expect(normalizeImportedPath("../secret.ts")).toBeNull();
    expect(normalizeImportedPath("node_modules/left-pad/index.js")).toBeNull();
    expect(normalizeImportedPath(".env")).toBeNull();
    expect(normalizeImportedPath("src/app/page.tsx")).toBe("src/app/page.tsx");
    expect(normalizeImportedPath("../escape.png")).toBeNull();
    expect(normalizeImportedPath("public/../../escape.png")).toBeNull();
    expect(normalizeImportedPath("node_modules/foo.png")).toBeNull();
  });
});

describe("decodeLocalZipContent", () => {
  it("rejects oversized local uploads before persist", () => {
    const oversized = Buffer.alloc(MAX_LOCAL_ZIP_UPLOAD_BYTES + 1, 1).toString("base64");
    expect(() => decodeLocalZipContent(oversized)).toThrowError(/ZIP får vara högst/);
  });
});

describe("extractImportedFilesFromZip", () => {
  it("keeps text files and drops a real .env", async () => {
    const zip = new JSZip();
    zip.file("repo/src/app/page.tsx", "export default function Page() { return null }");
    zip.file("repo/.env", "SECRET=1");
    zip.file("repo/node_modules/left-pad/index.js", "module.exports = 1");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const files = await extractImportedFilesFromZip(buffer);
    expect(files.map((file) => file.path)).toEqual(["src/app/page.tsx"]);
  });

  it("keeps referenced images and fonts as a single canonical base64 envelope", async () => {
    const zip = new JSZip();
    zip.file(
      "site/app/page.tsx",
      'export default function Page() { return <img src="/logo.png" alt="" /> }',
    );
    zip.file(
      "site/app/globals.css",
      '@font-face { font-family: Site; src: url("/fonts/site.woff2"); }',
    );
    zip.file("site/package.json", '{ "name": "site" }');
    zip.file("site/public/logo.png", PNG_1X1);
    zip.file("site/public/fonts/site.woff2", WOFF2_STUB);
    zip.file("site/public/video.mp4", Buffer.from("ftyp"));
    zip.file("site/tools/hack.exe", Buffer.from("MZ"));
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const files = await extractImportedFilesFromZip(buffer);
    const byPath = Object.fromEntries(files.map((file) => [file.path, file]));

    expect(byPath["public/logo.png"]).toMatchObject({
      language: "binary",
      content: encodeImportedBinaryContent(PNG_1X1),
    });
    expect(byPath["public/fonts/site.woff2"]).toMatchObject({
      language: "binary",
      content: encodeImportedBinaryContent(WOFF2_STUB),
    });
    expect(decodeImportedBinaryContent(byPath["public/logo.png"].content)).toEqual(PNG_1X1);
    expect(decodeImportedBinaryContent(byPath["public/fonts/site.woff2"].content)).toEqual(
      WOFF2_STUB,
    );
    expect(isNonTextContentFile(byPath["public/logo.png"])).toBe(true);
    expect(byPath["public/video.mp4"]).toBeUndefined();
    expect(byPath["tools/hack.exe"]).toBeUndefined();
    expect(byPath["app/page.tsx"].content).toContain("/logo.png");
    expect(byPath["app/globals.css"].content).toContain("/fonts/site.woff2");

    const persisted = JSON.parse(JSON.stringify(files)) as typeof files;
    expect(persisted.find((file) => file.path === "public/logo.png")?.content).toBe(
      encodeImportedBinaryContent(PNG_1X1),
    );
    expect(materializePreviewHostBinary(persisted.find((file) => file.path === "public/logo.png")!.content)).toEqual(
      PNG_1X1,
    );
    expect(
      materializePreviewHostBinary(
        persisted.find((file) => file.path === "public/fonts/site.woff2")!.content,
      ),
    ).toEqual(WOFF2_STUB);
  });

  it("never UTF-8-decodes an allowed binary extension into file content", async () => {
    const zip = new JSZip();
    zip.file("app/page.tsx", "export default function Page() { return null }");
    zip.file("public/logo.png", PNG_1X1);
    const files = await extractImportedFilesFromZip(await zip.generateAsync({ type: "nodebuffer" }));
    const logo = files.find((file) => file.path === "public/logo.png");
    expect(logo?.content.startsWith("base64:")).toBe(true);
    expect(logo?.content.includes("\uFFFD")).toBe(false);
  });

  it("blocks traversal, node_modules and env paths for binaries too", async () => {
    const zip = new JSZip();
    zip.file("app/page.tsx", "export default function Page() { return null }");
    zip.file("node_modules/foo.png", PNG_1X1);
    zip.file(".env", "SECRET=1");
    const files = await extractImportedFilesFromZip(await zip.generateAsync({ type: "nodebuffer" }));
    expect(files.map((file) => file.path)).toEqual(["app/page.tsx"]);
  });

  it("skips an oversized binary without mixing it into the text budget", async () => {
    const zip = new JSZip();
    zip.file("app/page.tsx", "export default function Page() { return null }");
    zip.file("public/huge.png", Buffer.alloc(PNG_1X1.byteLength + 16, 1));
    zip.file("public/ok.png", PNG_1X1);
    const files = await extractImportedFilesFromZip(await zip.generateAsync({ type: "nodebuffer" }), {
      maxBinaryFileBytes: PNG_1X1.byteLength,
      maxBinaryTotalBytes: 1024,
    });
    expect(files.map((file) => file.path).sort()).toEqual(["app/page.tsx", "public/ok.png"]);
  });

  it("enforces a separate total binary budget on decoded bytes", async () => {
    const zip = new JSZip();
    zip.file("app/page.tsx", "export default function Page() { return null }");
    zip.file("public/a.png", Buffer.alloc(20, 2));
    zip.file("public/b.png", Buffer.alloc(20, 3));
    const files = await extractImportedFilesFromZip(await zip.generateAsync({ type: "nodebuffer" }), {
      maxBinaryFileBytes: 24,
      maxBinaryTotalBytes: 24,
    });
    expect(files.filter((file) => file.language === "binary")).toHaveLength(1);
    expect(files.some((file) => file.path === "app/page.tsx")).toBe(true);
  });

  it("unwraps a persisted base64 envelope once so re-import does not double-wrap", async () => {
    const wrapped = Buffer.from(encodeImportedBinaryContent(PNG_1X1), "utf8");
    expect(normalizeImportedBinaryBytes(wrapped)).toEqual(PNG_1X1);
    const zip = new JSZip();
    zip.file("app/page.tsx", "export default function Page() { return null }");
    zip.file("public/logo.png", wrapped);
    const files = await extractImportedFilesFromZip(await zip.generateAsync({ type: "nodebuffer" }));
    expect(files.find((file) => file.path === "public/logo.png")?.content).toBe(
      encodeImportedBinaryContent(PNG_1X1),
    );
  });
});
