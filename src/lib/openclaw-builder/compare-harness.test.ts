import { describe, expect, it } from "vitest";

import {
  MAX_COMPARE_FILES,
  MAX_COMPARE_PATH_LENGTH,
  compareShadowPlanToClassic,
} from "./compare-harness";

const HASH = "a".repeat(64);

function input(
  overrides: Partial<{
    generationInputPackageHash: string;
    planExpectedFiles: string[];
    classicChangedFiles: string[];
  }> = {},
) {
  return {
    generationInputPackageHash: HASH,
    planExpectedFiles: ["src/app/page.tsx", "src/lib/gen/stream/finalize-version.ts"],
    classicChangedFiles: ["src/app/page.tsx", "src/components/hero.tsx"],
    ...overrides,
  };
}

describe("compareShadowPlanToClassic", () => {
  it("reports overlap, missing, and extra against a classic diff", () => {
    const result = compareShadowPlanToClassic(input());

    expect(result).toEqual({
      ok: true,
      observation: {
        packageHash: HASH,
        predicted: ["src/app/page.tsx", "src/lib/gen/stream/finalize-version.ts"],
        actual: ["src/app/page.tsx", "src/components/hero.tsx"],
        missingFromClassic: ["src/lib/gen/stream/finalize-version.ts"],
        extraInClassic: ["src/components/hero.tsx"],
        overlap: ["src/app/page.tsx"],
      },
    });

    if (!result.ok) throw new Error("expected ok");
    expect(Object.keys(result.observation).sort()).toEqual([
      "actual",
      "extraInClassic",
      "missingFromClassic",
      "overlap",
      "packageHash",
      "predicted",
    ]);
    expect(result.observation).not.toHaveProperty("ran");
    expect(result.observation).not.toHaveProperty("applied");
    expect(result.observation).not.toHaveProperty("wrote");
    expect(result.observation).not.toHaveProperty("changed");
  });

  it("sorts every output array", () => {
    const result = compareShadowPlanToClassic(
      input({
        planExpectedFiles: ["z.ts", "a.ts", "m.ts"],
        classicChangedFiles: ["m.ts", "b.ts", "z.ts"],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.observation.predicted).toEqual(["a.ts", "m.ts", "z.ts"]);
    expect(result.observation.actual).toEqual(["b.ts", "m.ts", "z.ts"]);
    expect(result.observation.overlap).toEqual(["m.ts", "z.ts"]);
    expect(result.observation.missingFromClassic).toEqual(["a.ts"]);
    expect(result.observation.extraInClassic).toEqual(["b.ts"]);
  });

  it("accepts empty lists", () => {
    const bothEmpty = compareShadowPlanToClassic(
      input({ planExpectedFiles: [], classicChangedFiles: [] }),
    );
    expect(bothEmpty).toEqual({
      ok: true,
      observation: {
        packageHash: HASH,
        predicted: [],
        actual: [],
        missingFromClassic: [],
        extraInClassic: [],
        overlap: [],
      },
    });

    const predictedOnly = compareShadowPlanToClassic(
      input({ planExpectedFiles: ["src/a.ts"], classicChangedFiles: [] }),
    );
    expect(predictedOnly).toEqual({
      ok: true,
      observation: {
        packageHash: HASH,
        predicted: ["src/a.ts"],
        actual: [],
        missingFromClassic: ["src/a.ts"],
        extraInClassic: [],
        overlap: [],
      },
    });

    const classicOnly = compareShadowPlanToClassic(
      input({ planExpectedFiles: [], classicChangedFiles: ["src/b.ts"] }),
    );
    expect(classicOnly).toEqual({
      ok: true,
      observation: {
        packageHash: HASH,
        predicted: [],
        actual: ["src/b.ts"],
        missingFromClassic: [],
        extraInClassic: ["src/b.ts"],
        overlap: [],
      },
    });
  });

  it("collapses duplicates after normalize", () => {
    const result = compareShadowPlanToClassic(
      input({
        planExpectedFiles: ["src/a.ts", "src/a.ts", "src/b.ts", "src/a.ts"],
        classicChangedFiles: ["src/b.ts", "src/b.ts", "src/c.ts"],
      }),
    );

    expect(result).toEqual({
      ok: true,
      observation: {
        packageHash: HASH,
        predicted: ["src/a.ts", "src/b.ts"],
        actual: ["src/b.ts", "src/c.ts"],
        missingFromClassic: ["src/a.ts"],
        extraInClassic: ["src/c.ts"],
        overlap: ["src/b.ts"],
      },
    });
  });

  it("rejects an invalid path", () => {
    expect(
      compareShadowPlanToClassic(input({ planExpectedFiles: ["../secret"] })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      compareShadowPlanToClassic(input({ classicChangedFiles: ["/etc/passwd"] })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      compareShadowPlanToClassic(input({ planExpectedFiles: ["foo/../../etc/passwd"] })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      compareShadowPlanToClassic(input({ classicChangedFiles: ["foo\\bar"] })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      compareShadowPlanToClassic(input({ planExpectedFiles: [""] })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      compareShadowPlanToClassic(input({ classicChangedFiles: ["."] })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      compareShadowPlanToClassic(
        input({ planExpectedFiles: ["C:windows/system32"] }),
      ),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      compareShadowPlanToClassic(
        input({ planExpectedFiles: [`src/${"x".repeat(MAX_COMPARE_PATH_LENGTH)}.ts`] }),
      ),
    ).toEqual({ ok: false, code: "invalid_input" });
  });

  it("rejects a bad hash", () => {
    expect(
      compareShadowPlanToClassic(input({ generationInputPackageHash: "A".repeat(64) })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      compareShadowPlanToClassic(input({ generationInputPackageHash: "not-a-hash" })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      compareShadowPlanToClassic(input({ generationInputPackageHash: HASH.slice(0, 63) })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      compareShadowPlanToClassic(input({ generationInputPackageHash: `${HASH}a` })),
    ).toEqual({ ok: false, code: "invalid_input" });
  });

  it("rejects a list longer than 80 files", () => {
    const tooMany = Array.from({ length: MAX_COMPARE_FILES + 1 }, (_, i) => `src/f${i}.ts`);
    expect(compareShadowPlanToClassic(input({ planExpectedFiles: tooMany }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(compareShadowPlanToClassic(input({ classicChangedFiles: tooMany }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });
});
