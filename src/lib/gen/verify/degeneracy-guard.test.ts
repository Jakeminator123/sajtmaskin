import { describe, expect, it } from "vitest";
import {
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
