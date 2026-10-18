// @vitest-environment node
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("plan review browser boundary", () => {
  it.each([
    "src/lib/builder/prompt-builder.ts",
    "src/lib/hooks/chat/stream-handlers-done.ts",
  ])("bundles the real client entry %s without server-only dependencies", async (entryPoint) => {
    const result = await build({
      absWorkingDir: process.cwd(),
      entryPoints: [entryPoint],
      bundle: true,
      platform: "browser",
      format: "esm",
      // Dev bundling must not rely on production dead-code elimination.
      treeShaking: false,
      write: false,
      logLevel: "silent",
    });

    expect(result.errors).toEqual([]);
    expect(result.outputFiles).toHaveLength(1);
    expect(result.outputFiles[0].contents.byteLength).toBeGreaterThan(0);
  });
});
