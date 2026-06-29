import { describe, expect, it } from "vitest";
import {
  capDegeneratePayload,
  DEFAULT_DEGENERACY_THRESHOLDS,
  detectDegenerateFiles,
  detectDegenerateProjectJson,
} from "./degeneracy-guard";

describe("detectDegenerateFiles", () => {
  it("is clean for a normal project", () => {
    const result = detectDegenerateFiles([
      {
        path: "app/page.tsx",
        content: "export default function Page(){return <main>hi</main>;}",
      },
      { path: "package.json", content: '{"name":"x"}' },
    ]);
    expect(result.degenerate).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("flags an oversized single file (the ~4.4 MB credential-deck class)", () => {
    const huge = "x".repeat(DEFAULT_DEGENERACY_THRESHOLDS.maxSingleFileBytes + 1);
    const result = detectDegenerateFiles([
      { path: "components/credential-deck.tsx", content: huge },
    ]);
    expect(result.degenerate).toBe(true);
    expect(result.file).toBe("components/credential-deck.tsx");
    expect(result.sizeBytes).toBeGreaterThan(DEFAULT_DEGENERACY_THRESHOLDS.maxSingleFileBytes);
    expect(result.reason).toContain("ceiling");
  });

  it("flags total project bloat split across several sub-ceiling files", () => {
    // Each file is under the single-file ceiling, but together they exceed the
    // total-project ceiling (Codex #322 P2).
    const perFile = "a".repeat(700_000); // < 768 KB single-file ceiling
    const files = Array.from({ length: 6 }, (_unused, i) => ({
      path: `components/chunk-${i}.tsx`,
      content: perFile,
    }));
    const result = detectDegenerateFiles(files);
    expect(result.degenerate).toBe(true);
    expect(result.reason).toContain("Total project size");
  });

  it("does NOT flag a legitimate data-heavy page with repeated short rows", () => {
    // Repeated DATA rows (image URLs, category strings) are shorter than the
    // 40-char code-line threshold and must not trip the repetition heuristic.
    const rows = Array.from({ length: 300 }, () => '  { src: "/img/x.png" },').join("\n");
    const result = detectDegenerateFiles([
      { path: "app/catalog/page.tsx", content: `const DATA = [\n${rows}\n];` },
    ]);
    expect(result.degenerate).toBe(false);
  });

  it("flags self-repetition (a substantial line repeated past the cap)", () => {
    const line = "export function CredentialDeck() { return <Deck cards={CARDS} />; }";
    const repeated = Array.from(
      { length: DEFAULT_DEGENERACY_THRESHOLDS.maxLineRepeats + 5 },
      () => line,
    ).join("\n");
    const result = detectDegenerateFiles([
      { path: "components/credential-deck.tsx", content: repeated },
    ]);
    expect(result.degenerate).toBe(true);
    expect(result.repeatCount).toBeGreaterThanOrEqual(
      DEFAULT_DEGENERACY_THRESHOLDS.maxLineRepeats,
    );
    expect(result.reason).toContain("self-repetition");
  });

  it("does NOT flag ordinary repeated short boilerplate", () => {
    // Short lines (closing tags, braces) repeated many times must not trip it.
    const boilerplate = Array.from({ length: 400 }, () => "  </div>").join("\n");
    const result = detectDegenerateFiles([
      {
        path: "app/page.tsx",
        content: `export default function P(){return (<main>${boilerplate}</main>);}`,
      },
    ]);
    expect(result.degenerate).toBe(false);
  });

  it("ignores empty input and missing content", () => {
    expect(detectDegenerateFiles([]).degenerate).toBe(false);
    expect(detectDegenerateFiles([{ path: "x.ts" }]).degenerate).toBe(false);
  });
});

describe("capDegeneratePayload", () => {
  it("stubs the single oversized file so the persisted payload is small", () => {
    const files = [
      { path: "package.json", content: "{}" },
      { path: "components/big.tsx", content: "z".repeat(2_000_000) },
    ];
    const { files: out, stubbedPaths } = capDegeneratePayload(files, "too big");
    expect(stubbedPaths).toEqual(["components/big.tsx"]);
    expect(out.find((f) => f.path === "components/big.tsx")!.content.length).toBeLessThan(200);
    expect(out.find((f) => f.path === "package.json")!.content).toBe("{}");
  });

  it("stubs multiple files for total-size bloat split across files (Codex #322)", () => {
    const files = Array.from({ length: 6 }, (_unused, i) => ({
      path: `c-${i}.tsx`,
      content: "a".repeat(700_000),
    }));
    const { files: out, stubbedPaths } = capDegeneratePayload(files, "total too big");
    expect(stubbedPaths.length).toBeGreaterThan(1);
    const totalAfter = out.reduce((n, f) => n + f.content.length, 0);
    expect(totalAfter).toBeLessThanOrEqual(1_000_000);
  });

  it("stubs nothing when already under the cap", () => {
    const { stubbedPaths } = capDegeneratePayload([{ path: "a.tsx", content: "small" }], null);
    expect(stubbedPaths).toEqual([]);
  });
});

describe("detectDegenerateProjectJson", () => {
  it("parses files_json and flags an oversized file", () => {
    const huge = "y".repeat(DEFAULT_DEGENERACY_THRESHOLDS.maxSingleFileBytes + 10);
    const filesJson = JSON.stringify([{ path: "components/big.tsx", content: huge }]);
    expect(detectDegenerateProjectJson(filesJson).degenerate).toBe(true);
  });

  it("treats unparseable / non-array json as non-degenerate (other guards handle it)", () => {
    expect(detectDegenerateProjectJson("not json").degenerate).toBe(false);
    expect(detectDegenerateProjectJson('{"not":"array"}').degenerate).toBe(false);
  });
});
