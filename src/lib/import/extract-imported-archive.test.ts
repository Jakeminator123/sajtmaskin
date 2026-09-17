import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  decodeLocalZipContent,
  extractImportedFilesFromZip,
  normalizeImportedPath,
} from "./extract-imported-archive";
import { MAX_LOCAL_ZIP_UPLOAD_BYTES } from "./import-init-contract";

describe("normalizeImportedPath", () => {
  it("drops traversal and blocked prefixes", () => {
    expect(normalizeImportedPath("../secret.ts")).toBeNull();
    expect(normalizeImportedPath("node_modules/left-pad/index.js")).toBeNull();
    expect(normalizeImportedPath(".env")).toBeNull();
    expect(normalizeImportedPath("src/app/page.tsx")).toBe("src/app/page.tsx");
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
});
