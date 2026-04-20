/**
 * Generic round-trip / symmetry tests for every `parseX ↔ formatX`
 * pair in `src/lib/gen/preview/`.
 *
 * Drop-in template: when you add a new pair, append a `cases` entry
 * below. The test guarantees that
 *
 *   parse(format(input))  ===  input
 *   format(parse(format(input)))  ===  format(input)
 *
 * for a varied input fixture set covering the chars that historically
 * leaked across encode boundaries (backslash, double-quote, newline,
 * hash, leading/trailing space, empty string, unicode).
 *
 * If you write a parser/formatter pair that intentionally violates
 * symmetry, you must either (a) drop it from the registry below or
 * (b) document the asymmetry inline. Don't just delete the test —
 * the whole point is that "varför ser det konstigt ut" never leaks
 * back in via a future addition.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap: vi.fn(async () => ({})),
}));

import { formatDotenvBody, resolvePreviewEnvLayers } from "@/lib/gen/preview/env-local";

interface SymmetryCase<TParsed> {
  /** Stable name for the symbol pair, used in test titles. */
  name: string;
  /** Fixture inputs to run the round-trip on. */
  fixtures: TParsed[];
  /** Encode the parsed value to its on-the-wire representation. */
  format: (parsed: TParsed) => string;
  /**
   * Decode the on-the-wire representation back to the parsed shape.
   * Some parsers are not directly importable (private to a module);
   * in that case wrap `formatX` round-trip via the public read path.
   */
  parse: (formatted: string) => TParsed | Promise<TParsed>;
}

async function runRoundTrip<TParsed>(c: SymmetryCase<TParsed>) {
  for (const fixture of c.fixtures) {
    const encodedOnce = c.format(fixture);
    const parsed = await c.parse(encodedOnce);
    const encodedTwice = c.format(parsed);
    expect(parsed).toEqual(fixture);
    expect(encodedTwice).toBe(encodedOnce);
  }
}

// ---------------------------------------------------------------------------
// Registered pairs.
// ---------------------------------------------------------------------------

const dotenvBodyCase: SymmetryCase<Record<string, string>> = {
  name: "dotenv-body",
  format: (vars) => formatDotenvBody(vars),
  parse: async (encoded) => {
    // parseDotenvBody is private to env-local.ts. Use the public read
    // path (`resolvePreviewEnvLayers` with the encoded value as the
    // `generated` layer) to exercise the same parser; only return the
    // keys whose provenance is `generated` so we round-trip the same
    // set the caller supplied (placeholder layers are filtered out).
    const { merged, provenance } = await resolvePreviewEnvLayers({
      appProjectId: "proj_symmetry",
      generatedEnvLocal: encoded,
    });
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(merged)) {
      if (provenance[k] === "generated") out[k] = v;
    }
    return out;
  },
  fixtures: [
    { SIMPLE: "abc" },
    { EMPTY: "" },
    { WITH_SPACES: "value with spaces" },
    { WITH_HASH: "value#with#hash" },
    { WITH_QUOTES: 'a "quoted" b' },
    { WITH_BACKSLASH: "a\\b\\c" },
    { WITH_NEWLINE: "line1\nline2\nline3" },
    { ALL_AT_ONCE: 'multi\nline "quoted" \\ slash' },
    { UNICODE: "räksmörgås — café" },
    { MULTIPLE: "a", KEYS: "b", AT_ONCE: "c" },
  ],
};

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe("preview parse/format pair symmetry", () => {
  it(`${dotenvBodyCase.name}: format(parse(format(x))) === format(x)`, async () => {
    await runRoundTrip(dotenvBodyCase);
  });
});
