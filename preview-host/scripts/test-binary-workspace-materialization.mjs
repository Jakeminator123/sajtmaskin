/**
 * Focused compatibility contract for persisted binary files. Historical
 * template imports could persist `base64:<base64:...>`; the host may unwrap
 * exactly that one legacy layer only when it reveals a known binary magic.
 *
 * Run with: `node scripts/test-binary-workspace-materialization.mjs`
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "preview-host-binary-materialization-"));
process.env.PREVIEW_HOST_DATA_DIR = dataDir;

const require = createRequire(import.meta.url);
const { patchWorkspaceFiles, writeFilesIntoWorkspace } = require(
  "../src/runtime/workspace-files.js",
);

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

function isoBmffBytes(brand) {
  const bytes = Buffer.alloc(20);
  bytes.writeUInt32BE(bytes.length, 0);
  bytes.write("ftyp", 4, "ascii");
  bytes.write(brand, 8, "ascii");
  bytes.writeUInt32BE(0, 12);
  bytes.write(brand, 16, "ascii");
  return bytes;
}

function bmpBytes() {
  const bytes = Buffer.alloc(54);
  bytes.write("BM", 0, "ascii");
  bytes.writeUInt32LE(bytes.length, 2);
  bytes.writeUInt32LE(54, 10);
  return bytes;
}

function eotBytes() {
  const bytes = Buffer.alloc(84);
  bytes.writeUInt32LE(bytes.length, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(0x00020002, 8);
  bytes.writeUInt16LE(0x504c, 34);
  return bytes;
}

function riffBytes(formType) {
  const bytes = Buffer.alloc(12);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write(formType, 8, "ascii");
  return bytes;
}

function id3Bytes() {
  return Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

function ebmlBytes(docType) {
  const value = Buffer.from(docType, "ascii");
  const docTypeElement = Buffer.concat([Buffer.from([0x42, 0x82, 0x80 + value.length]), value]);
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80 + docTypeElement.length]),
    docTypeElement,
  ]);
}

const LEGACY_ASSET_CASES = [
  { path: "public/legacy-double.png", bytes: PNG_BYTES },
  { path: "public/favicon.ico", bytes: Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]) },
  { path: "public/fonts/site.woff", bytes: Buffer.from("wOFFfont", "ascii") },
  { path: "public/fonts/site.woff2", bytes: Buffer.from("wOF2font", "ascii") },
  { path: "public/fonts/site.ttf", bytes: Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x01]) },
  { path: "public/fonts/site.otf", bytes: Buffer.from("OTTOfont", "ascii") },
  { path: "public/guide.pdf", bytes: Buffer.from("%PDF-1.7\n", "ascii") },
  { path: "public/photo.avif", bytes: isoBmffBytes("avif") },
  { path: "public/photo.bmp", bytes: bmpBytes() },
  { path: "public/fonts/site.eot", bytes: eotBytes() },
  { path: "public/video.mp4", bytes: isoBmffBytes("isom") },
  { path: "public/video.webm", bytes: ebmlBytes("webm") },
  { path: "public/audio.mp3", bytes: id3Bytes() },
  { path: "public/audio.wav", bytes: riffBytes("WAVE") },
  { path: "public/video.mov", bytes: isoBmffBytes("qt  ") },
  { path: "public/video.avi", bytes: riffBytes("AVI ") },
];

function envelope(bytes) {
  return `base64:${Buffer.from(bytes).toString("base64")}`;
}

try {
  const fullWorkspace = join(dataDir, "direct-workspace");
  const singlePng = envelope(PNG_BYTES);
  const legacyDoublePng = envelope(Buffer.from(singlePng, "utf8"));
  const innerTextEnvelope = envelope(Buffer.from("ordinary text", "utf8"));
  const legacyDoubleText = envelope(Buffer.from(innerTextEnvelope, "utf8"));
  const nonCanonicalPngEnvelope = `base64:${PNG_BYTES.toString("base64").replace(/=+$/, "")}`;
  const legacyDoubleNonCanonicalPng = envelope(
    Buffer.from(nonCanonicalPngEnvelope, "utf8"),
  );
  const recursivelyWrappedPng = envelope(Buffer.from(envelope(Buffer.from(singlePng)), "utf8"));
  const bmpLookalikeEnvelope = envelope(Buffer.from("BM ordinary text", "utf8"));
  const malformedId3 = id3Bytes();
  malformedId3[6] = 0x80;
  const malformedId3Envelope = envelope(malformedId3);
  const matroskaEnvelope = envelope(ebmlBytes("matroska"));
  const malformedMov = isoBmffBytes("qt  ");
  malformedMov.writeUInt32BE(malformedMov.length + 4, 0);
  const malformedMovEnvelope = envelope(malformedMov);
  const malformedAvi = riffBytes("AVI ");
  malformedAvi.writeUInt32LE(malformedAvi.length, 4);
  const malformedAviEnvelope = envelope(malformedAvi);
  const legacyAssetFiles = Object.fromEntries(
    LEGACY_ASSET_CASES.map(({ path, bytes }) => [
      path,
      envelope(Buffer.from(envelope(bytes), "utf8")),
    ]),
  );

  writeFilesIntoWorkspace(fullWorkspace, {
    ...legacyAssetFiles,
    "public/single.png": singlePng,
    "public/not-an-asset.bin": legacyDoubleText,
    "public/non-canonical.png": legacyDoubleNonCanonicalPng,
    "public/recursive.png": recursivelyWrappedPng,
    "public/not-bmp.bmp": envelope(Buffer.from(bmpLookalikeEnvelope, "utf8")),
    "public/not-mp3.mp3": envelope(Buffer.from(malformedId3Envelope, "utf8")),
    "public/not-webm.webm": envelope(Buffer.from(matroskaEnvelope, "utf8")),
    "public/not-mov.mov": envelope(Buffer.from(malformedMovEnvelope, "utf8")),
    "public/not-avi.avi": envelope(Buffer.from(malformedAviEnvelope, "utf8")),
  });

  assert.deepEqual(readFileSync(join(fullWorkspace, "public/single.png")), PNG_BYTES);
  for (const { path, bytes } of LEGACY_ASSET_CASES) {
    assert.deepEqual(readFileSync(join(fullWorkspace, path)), bytes, path);
  }
  assert.equal(
    readFileSync(join(fullWorkspace, "public/not-an-asset.bin"), "utf8"),
    innerTextEnvelope,
  );
  assert.equal(
    readFileSync(join(fullWorkspace, "public/non-canonical.png"), "utf8"),
    nonCanonicalPngEnvelope,
  );
  assert.equal(
    readFileSync(join(fullWorkspace, "public/recursive.png"), "utf8"),
    envelope(Buffer.from(singlePng)),
  );
  assert.equal(
    readFileSync(join(fullWorkspace, "public/not-bmp.bmp"), "utf8"),
    bmpLookalikeEnvelope,
  );
  assert.equal(
    readFileSync(join(fullWorkspace, "public/not-mp3.mp3"), "utf8"),
    malformedId3Envelope,
  );
  assert.equal(
    readFileSync(join(fullWorkspace, "public/not-webm.webm"), "utf8"),
    matroskaEnvelope,
  );
  assert.equal(
    readFileSync(join(fullWorkspace, "public/not-mov.mov"), "utf8"),
    malformedMovEnvelope,
  );
  assert.equal(
    readFileSync(join(fullWorkspace, "public/not-avi.avi"), "utf8"),
    malformedAviEnvelope,
  );

  patchWorkspaceFiles("binary-patch", { "public/patched.png": legacyDoublePng });
  assert.deepEqual(
    readFileSync(join(dataDir, "workspaces", "binary-patch", "public/patched.png")),
    PNG_BYTES,
  );

  console.log("OK   binary workspace materialization compatibility contract");
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
