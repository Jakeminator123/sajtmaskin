import JSZip from "jszip";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  extractV0TemplateArchiveFiles,
  extractV0TemplateReferenceFiles,
  readArchiveBuffer,
  type LocalV0TemplateSource,
} from "./local-v0-template-source";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

function isoBmffBytes(brand: string): Buffer {
  const bytes = Buffer.alloc(20);
  bytes.writeUInt32BE(bytes.length, 0);
  bytes.write("ftyp", 4, "ascii");
  bytes.write(brand, 8, "ascii");
  bytes.writeUInt32BE(0, 12);
  bytes.write(brand, 16, "ascii");
  return bytes;
}

function bmpBytes(): Buffer {
  const bytes = Buffer.alloc(54);
  bytes.write("BM", 0, "ascii");
  bytes.writeUInt32LE(bytes.length, 2);
  bytes.writeUInt32LE(54, 10);
  return bytes;
}

function eotBytes(): Buffer {
  const bytes = Buffer.alloc(84);
  bytes.writeUInt32LE(bytes.length, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(0x00020002, 8);
  bytes.writeUInt16LE(0x504c, 34);
  return bytes;
}

function riffBytes(formType: "WEBP" | "WAVE" | "AVI "): Buffer {
  const bytes = Buffer.alloc(12);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write(formType, 8, "ascii");
  return bytes;
}

function id3Bytes(): Buffer {
  return Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

function ebmlBytes(docType: string): Buffer {
  const value = Buffer.from(docType, "ascii");
  const docTypeElement = Buffer.concat([Buffer.from([0x42, 0x82, 0x80 + value.length]), value]);
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80 + docTypeElement.length]),
    docTypeElement,
  ]);
}

const SERIALIZED_BINARY_ASSET_CASES = [
  { name: "ICO", path: "public/favicon.ico", bytes: Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]) },
  { name: "WOFF", path: "public/fonts/site.woff", bytes: Buffer.from("wOFFfont", "ascii") },
  { name: "WOFF2", path: "public/fonts/site.woff2", bytes: Buffer.from("wOF2font", "ascii") },
  { name: "TTF", path: "public/fonts/site.ttf", bytes: Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x01]) },
  { name: "OTF", path: "public/fonts/site.otf", bytes: Buffer.from("OTTOfont", "ascii") },
  { name: "PDF", path: "public/guide.pdf", bytes: Buffer.from("%PDF-1.7\n", "ascii") },
  { name: "AVIF", path: "public/photo.avif", bytes: isoBmffBytes("avif") },
  { name: "BMP", path: "public/photo.bmp", bytes: bmpBytes() },
  { name: "EOT", path: "public/fonts/site.eot", bytes: eotBytes() },
  { name: "MP4", path: "public/video.mp4", bytes: isoBmffBytes("isom") },
  { name: "WebM", path: "public/video.webm", bytes: ebmlBytes("webm") },
  { name: "MP3", path: "public/audio.mp3", bytes: id3Bytes() },
  { name: "WAV", path: "public/audio.wav", bytes: riffBytes("WAVE") },
  { name: "MOV", path: "public/video.mov", bytes: isoBmffBytes("qt  ") },
  { name: "AVI", path: "public/video.avi", bytes: riffBytes("AVI ") },
] as const;

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

describe("extractV0TemplateArchiveFiles", () => {
  it("normalizes a canonically Base64-serialized PNG without double-encoding it", async () => {
    const zip = new JSZip();
    const canonical = PNG_BYTES.toString("base64");
    zip.file("template/public/logo.png", `base64:${canonical}`);

    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const files = await extractV0TemplateArchiveFiles(archive);

    expect(files).toContainEqual({
      path: "public/logo.png",
      content: `base64:${canonical}`,
      language: "binary",
    });
  });

  it("keeps raw PNG bytes on the same single-Base64 persistence contract", async () => {
    const zip = new JSZip();
    zip.file("template/public/logo.png", PNG_BYTES);

    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const files = await extractV0TemplateArchiveFiles(archive);

    expect(files).toContainEqual({
      path: "public/logo.png",
      content: `base64:${PNG_BYTES.toString("base64")}`,
      language: "binary",
    });
  });

  it.each(SERIALIZED_BINARY_ASSET_CASES)(
    "normalizes a canonically Base64-serialized $name asset",
    async ({ path, bytes }) => {
      const zip = new JSZip();
      const serialized = `base64:${bytes.toString("base64")}`;
      zip.file(`template/${path}`, serialized);

      const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      const files = await extractV0TemplateArchiveFiles(archive);

      expect(files).toContainEqual({ path, content: serialized, language: "binary" });
    },
  );

  it(
    "counts a serialized binary against the decoded disk-byte budget",
    async () => {
      const zip = new JSZip();
      // 24 MiB becomes 32 MiB of Base64 plus the prefix. The serialized ZIP
      // representation is therefore over the 32 MiB binary budget while the
      // bytes that actually land on disk are still within it.
      const diskBytes = Buffer.alloc(24 * 1024 * 1024);
      PNG_BYTES.copy(diskBytes);
      const serialized = `base64:${diskBytes.toString("base64")}`;
      zip.file("template/public/large.png", serialized);

      const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      const files = await extractV0TemplateArchiveFiles(archive);

      expect(files).toContainEqual({
        path: "public/large.png",
        content: serialized,
        language: "binary",
      });
    },
    20_000,
  );

  it("does not unwrap non-canonical Base64 or canonical Base64 without known binary magic", async () => {
    const zip = new JSZip();
    const nonCanonical = `base64:${PNG_BYTES.toString("base64").replace(/=+$/, "")}`;
    const encodedText = `base64:${Buffer.from("ordinary text", "utf8").toString("base64")}`;
    const bmpLookalike = Buffer.from("BM ordinary text", "utf8");
    const unknownIsoBrand = isoBmffBytes("heic");
    const malformedId3 = id3Bytes();
    malformedId3[6] = 0x80;
    const matroskaEbml = ebmlBytes("matroska");
    const malformedMov = isoBmffBytes("qt  ");
    malformedMov.writeUInt32BE(malformedMov.length + 4, 0);
    const malformedAvi = riffBytes("AVI ");
    malformedAvi.writeUInt32LE(malformedAvi.length, 4);
    zip.file("template/public/non-canonical.png", nonCanonical);
    zip.file("template/public/text.png", encodedText);
    zip.file("template/public/not-bmp.bmp", `base64:${bmpLookalike.toString("base64")}`);
    zip.file("template/public/not-supported.bin", `base64:${unknownIsoBrand.toString("base64")}`);
    zip.file("template/public/not-mp3.mp3", `base64:${malformedId3.toString("base64")}`);
    zip.file("template/public/not-webm.webm", `base64:${matroskaEbml.toString("base64")}`);
    zip.file("template/public/not-mov.mov", `base64:${malformedMov.toString("base64")}`);
    zip.file("template/public/not-avi.avi", `base64:${malformedAvi.toString("base64")}`);

    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const files = await extractV0TemplateArchiveFiles(archive);

    expect(files).toEqual(
      expect.arrayContaining([
        {
          path: "public/non-canonical.png",
          content: `base64:${Buffer.from(nonCanonical, "utf8").toString("base64")}`,
          language: "binary",
        },
        {
          path: "public/text.png",
          content: `base64:${Buffer.from(encodedText, "utf8").toString("base64")}`,
          language: "binary",
        },
        ...[
          ["public/not-bmp.bmp", bmpLookalike],
          ["public/not-supported.bin", unknownIsoBrand],
          ["public/not-mp3.mp3", malformedId3],
          ["public/not-webm.webm", matroskaEbml],
          ["public/not-mov.mov", malformedMov],
          ["public/not-avi.avi", malformedAvi],
        ].map(([path, bytes]) => {
          const serialized = `base64:${(bytes as Buffer).toString("base64")}`;
          return {
            path: path as string,
            content: `base64:${Buffer.from(serialized, "utf8").toString("base64")}`,
            language: "binary",
          };
        }),
      ]),
    );
  });
});

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
