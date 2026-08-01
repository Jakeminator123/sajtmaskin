/**
 * Binary-aware + inherited-content behavior of `capDegeneratePayload`.
 *
 * Kept SEPARATE from `degeneracy-guard.test.ts` on purpose: PR #732 extends
 * that file (binary-aware DETECTION), and this file binds the CAP side of the
 * same incident — prod chat 4d6b5546 (2026-08-01), where an imported
 * v0-template's 1.3 MB `public/assets/3d/texture_earth.jpg` (base64-stored)
 * was stubbed by the cap and silently destroyed in the persisted version.
 */
import { describe, expect, it } from "vitest";
import { capDegeneratePayload } from "./degeneracy-guard";

const MB = 1024 * 1024;

function binaryAsset(path: string, bytes: number) {
  // Imported binary files are persisted as base64 strings; the "base64:"
  // prefix is one of the signals `isNonTextContentFile` keys on.
  return { path, content: `base64:${"A".repeat(bytes - "base64:".length)}` };
}

describe("capDegeneratePayload — binary assets", () => {
  it("does NOT stub a legitimate 1.3 MB imported binary asset (prod chat 4d6b5546)", () => {
    const texture = binaryAsset("public/assets/3d/texture_earth.jpg", 1_327_000);
    const files = [
      texture,
      { path: "app/page.tsx", content: "export default function Page(){return <main/>;}" },
    ];
    const { files: out, stubbedPaths } = capDegeneratePayload(files, "flagged");
    expect(stubbedPaths).toEqual([]);
    expect(out.find((f) => f.path === texture.path)!.content).toBe(texture.content);
  });

  it("still stubs a binary asset over the 2 MB preview-host asset ceiling", () => {
    const oversized = binaryAsset("public/huge-video-poster.png", Math.round(2.5 * MB));
    const { files: out, stubbedPaths } = capDegeneratePayload([oversized], "too big");
    expect(stubbedPaths).toEqual([oversized.path]);
    expect(out[0].content.length).toBeLessThan(200);
  });

  it("treats language === 'binary' as a binary signal even without a binary extension", () => {
    const files = [
      { path: "public/data.bin.txt", content: "x".repeat(600_000), language: "binary" },
    ];
    // 600 KB is over the 512 KB source ceiling but under the 2 MB asset one.
    expect(capDegeneratePayload(files, "flagged").stubbedPaths).toEqual([]);
  });

  it("caps binary assets against their own 12 MB total budget", () => {
    const files = Array.from({ length: 7 }, (_unused, i) =>
      binaryAsset(`public/img-${i}.jpg`, 2 * MB),
    );
    // 14 MB of binaries: one must go to get under the 12 MB payload contract.
    const { files: out, stubbedPaths } = capDegeneratePayload(files, "total");
    expect(stubbedPaths.length).toBe(1);
    const remainingBinaryTotal = out
      .filter((f) => !stubbedPaths.includes(f.path))
      .reduce((n, f) => n + f.content.length, 0);
    expect(remainingBinaryTotal).toBeLessThanOrEqual(12 * MB);
  });
});

describe("capDegeneratePayload — source files keep the original ceilings", () => {
  it("still stubs an oversized generated source file", () => {
    const files = [
      { path: "app/page.tsx", content: "export default function Page(){return <main/>;}" },
      { path: "components/bloat.tsx", content: "z".repeat(800_000) },
    ];
    const { stubbedPaths } = capDegeneratePayload(files, "bloat");
    expect(stubbedPaths).toEqual(["components/bloat.tsx"]);
  });

  it("caps split source bloat to under 1 MB without evicting binary assets", () => {
    const texture = binaryAsset("public/assets/3d/texture_earth.jpg", 1_500_000);
    const files = [
      ...Array.from({ length: 6 }, (_unused, i) => ({
        path: `components/c-${i}.tsx`,
        content: "a".repeat(400_000),
      })),
      texture,
    ];
    const { files: out, stubbedPaths } = capDegeneratePayload(files, "split bloat");
    expect(stubbedPaths).not.toContain(texture.path);
    expect(out.find((f) => f.path === texture.path)!.content).toBe(texture.content);
    const sourceTotal = out
      .filter((f) => f.path.endsWith(".tsx"))
      .reduce((n, f) => n + f.content.length, 0);
    expect(sourceTotal).toBeLessThanOrEqual(1_000_000);
  });
});

describe("capDegeneratePayload — preservePaths (inherited content)", () => {
  it("never stubs a preserved path, even when individually oversized", () => {
    const files = [
      { path: "components/inherited-big.tsx", content: "x".repeat(900_000) },
      { path: "components/generated-big.tsx", content: "y".repeat(900_000) },
    ];
    const { files: out, stubbedPaths } = capDegeneratePayload(files, "bloat", {
      preservePaths: new Set(["components/inherited-big.tsx"]),
    });
    expect(stubbedPaths).toEqual(["components/generated-big.tsx"]);
    expect(out.find((f) => f.path === "components/inherited-big.tsx")!.content).toBe(
      files[0].content,
    );
  });

  it("never evicts a preserved path for the total cap, even if the pool stays over it", () => {
    const files = [
      { path: "data/inherited-a.ts", content: "a".repeat(500_000) },
      { path: "data/inherited-b.ts", content: "b".repeat(500_000) },
      { path: "data/inherited-c.ts", content: "c".repeat(500_000) },
    ];
    const { stubbedPaths } = capDegeneratePayload(files, "total", {
      preservePaths: new Set(files.map((f) => f.path)),
    });
    // 1.5 MB of inherited source stays intact: blocked upstream, not destroyed.
    expect(stubbedPaths).toEqual([]);
  });
});
