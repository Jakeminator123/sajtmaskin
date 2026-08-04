import JSZip from "jszip";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  extractV0TemplateReferenceFiles,
  readArchiveBuffer,
  type LocalV0TemplateSource,
} from "./local-v0-template-source";

async function buildArchive(marker: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("template/app/page.tsx", `export default function Page() { return <p>${marker}</p>; }`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function localSource(overrides: Partial<LocalV0TemplateSource>): LocalV0TemplateSource {
  return {
    templateId: "template-a",
    sourceKind: "local",
    sourceSlugs: [],
    sourceLabelsSv: [],
    categoryLabel: null,
    timestamp: null,
    ...overrides,
  };
}

describe("extractV0TemplateReferenceFiles", () => {
  it("reads only bounded frontend candidates from a template archive", async () => {
    const zip = new JSZip();
    zip.file(
      "template/app/page.tsx",
      'import { Hero } from "../components/hero";\nexport default function Page() { return <Hero />; }',
    );
    zip.file("template/components/hero.tsx", "export function Hero() { return <main>Hej</main>; }");
    zip.file("template/app/globals.css", ":root { --brand: blue; }");
    zip.file("template/app/api/private/route.ts", "export async function POST() {}");
    zip.file("template/package-lock.json", "x".repeat(2 * 1024 * 1024));
    zip.file("template/components/oversized.tsx", "x".repeat(1024 * 1024 + 1));
    zip.file("template/public/hero.png", Buffer.from([0, 1, 2, 3]));

    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const files = await extractV0TemplateReferenceFiles(archive);

    expect(files.map((file) => file.path)).toEqual([
      "app/page.tsx",
      "app/globals.css",
      "components/hero.tsx",
    ]);
    expect(files.every((file) => file.language !== "binary")).toBe(true);
  });
});

describe("readArchiveBuffer", () => {
  it("discards a stale local archive and re-fetches the manifest-bound Blob archive", async () => {
    const stale = await buildArchive("old");
    const fresh = await buildArchive("new");
    const directory = await mkdtemp(join(tmpdir(), "sajtmaskin-archive-"));
    const archivePath = join(directory, "cached.zip");
    await writeFile(archivePath, stale);

    const fetchMock = vi.fn(async () => new Response(new Uint8Array(fresh)));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const buffer = await readArchiveBuffer(
        localSource({
          archivePath,
          archiveUrl: "https://blob.example/template-a.zip",
          archiveSha256: createHash("sha256").update(fresh).digest("hex"),
        }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(buffer.equals(fresh)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps a local archive that matches the manifest SHA-256", async () => {
    const archive = await buildArchive("current");
    const directory = await mkdtemp(join(tmpdir(), "sajtmaskin-archive-"));
    const archivePath = join(directory, "cached.zip");
    await writeFile(archivePath, archive);

    const fetchMock = vi.fn(async () => new Response(new Uint8Array(archive)));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const buffer = await readArchiveBuffer(
        localSource({
          archivePath,
          archiveUrl: "https://blob.example/template-a.zip",
          archiveSha256: createHash("sha256").update(archive).digest("hex"),
        }),
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(buffer.equals(archive)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when the manifest SHA-256 is present but malformed", async () => {
    const archive = await buildArchive("current");
    const directory = await mkdtemp(join(tmpdir(), "sajtmaskin-archive-"));
    const archivePath = join(directory, "cached.zip");
    await writeFile(archivePath, archive);

    const fetchMock = vi.fn(async () => new Response(new Uint8Array(archive)));
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        readArchiveBuffer(
          localSource({
            archivePath,
            archiveUrl: "https://blob.example/template-a.zip",
            archiveSha256: "not-a-sha256",
          }),
        ),
      ).rejects.toThrow(/malformed/);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reads a local archive unverified when the manifest has no SHA-256 at all", async () => {
    const archive = await buildArchive("current");
    const directory = await mkdtemp(join(tmpdir(), "sajtmaskin-archive-"));
    const archivePath = join(directory, "cached.zip");
    await writeFile(archivePath, archive);

    try {
      const buffer = await readArchiveBuffer(
        localSource({ archivePath, archiveSha256: null }),
      );
      expect(buffer.equals(archive)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when a stale local archive has no Blob archive to fall back to", async () => {
    const stale = await buildArchive("old");
    const fresh = await buildArchive("new");
    const directory = await mkdtemp(join(tmpdir(), "sajtmaskin-archive-"));
    const archivePath = join(directory, "cached.zip");
    await writeFile(archivePath, stale);

    try {
      await expect(
        readArchiveBuffer(
          localSource({
            archivePath,
            archiveSha256: createHash("sha256").update(fresh).digest("hex"),
          }),
        ),
      ).rejects.toThrow(/SHA-256/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
