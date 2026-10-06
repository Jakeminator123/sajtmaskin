// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStaticCoreFromWorkspace } from "../../src/lib/gen/static-core-loader";
import { checkSystemPrompt } from "./check-systemprompt.mjs";

const roots: string[] = [];
function write(root: string, file: string, content: string) {
  const target = join(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
function fixture(content = "A valid short core.") {
  const root = mkdtempSync(join(tmpdir(), "sajtmaskin-core-check-"));
  roots.push(root);
  write(
    root,
    "config/codegen-core-manifest.json",
    JSON.stringify({ fragments: ["prompt-core/one.md"] }),
  );
  write(root, "config/prompt-core/one.md", content);
  return root;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("systemprompt preflight uses the runtime loader", () => {
  it("accepts a valid short core and uses real fragment assembly", () => {
    const root = fixture("\uFEFFFirst\n\n");
    write(root, "config/prompt-core/two.md", "Second\n");
    write(
      root,
      "config/codegen-core-manifest.json",
      JSON.stringify({
        fragments: ["prompt-core/one.md", "prompt-core/two.md"],
        fragmentSeparator: "\n--\n",
      }),
    );
    expect(getStaticCoreFromWorkspace(root)).toBe("First\n--\nSecond");
    expect(checkSystemPrompt(root)).toBe(0);
  });

  it.each([
    "../outside.md",
    "prompt-core\\..\\outside.md",
    "/prompt-core/one.md",
    "./prompt-core/one.md",
  ])("rejects the same invalid path as runtime: %s", (fragment) => {
    const root = fixture();
    write(root, "config/codegen-core-manifest.json", JSON.stringify({ fragments: [fragment] }));
    expect(() => getStaticCoreFromWorkspace(root)).toThrow(/Invalid fragment path/);
    expect(checkSystemPrompt(root)).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Invalid fragment path"));
  });

  it.each([
    ["missing fragment", JSON.stringify({ fragments: ["prompt-core/missing.md"] })],
    ["empty fragment list", JSON.stringify({ fragments: [] })],
    ["invalid JSON", "{"],
  ])("fails closed for %s", (_label, manifest) => {
    const root = fixture();
    write(root, "config/codegen-core-manifest.json", manifest);
    expect(() => getStaticCoreFromWorkspace(root)).toThrow();
    expect(checkSystemPrompt(root)).toBe(1);
  });

  it("rejects an empty assembled core", () => {
    const root = fixture(" \n\t");
    expect(checkSystemPrompt(root)).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("empty string"));
  });

  it("rejects retired fallbacks when the canonical manifest is missing", () => {
    const root = fixture();
    rmSync(join(root, "config/codegen-core-manifest.json"));
    const legacy = "This retired prompt must not rescue a missing canonical manifest. ".repeat(20);
    for (const file of [
      "config/systemprompt.md",
      "src/config/systemprompt",
      "scripts/systemprompt",
    ]) {
      write(root, file, legacy);
    }
    write(root, "config/prompt-static/old.md", legacy);
    write(
      root,
      "config/codegen-static-prompt.json",
      JSON.stringify({ fragments: ["prompt-static/old.md"] }),
    );
    expect(checkSystemPrompt(root)).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Missing core prompt"));
  });

  it("does not reuse a different workspace's cached prompt with matching timestamps", () => {
    const first = fixture("First workspace");
    const second = fixture("Second workspace");
    const stamp = new Date("2026-01-01T00:00:00Z");
    for (const root of [first, second]) {
      for (const file of ["config/codegen-core-manifest.json", "config/prompt-core/one.md"]) {
        utimesSync(join(root, file), stamp, stamp);
      }
    }
    expect(getStaticCoreFromWorkspace(first)).toBe("First workspace");
    expect(getStaticCoreFromWorkspace(second)).toBe("Second workspace");
    expect(checkSystemPrompt(second)).toBe(0);
  });
});
