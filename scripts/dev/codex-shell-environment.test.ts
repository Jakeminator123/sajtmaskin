import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(resolve(import.meta.dirname, "../../.codex/config.toml"), "utf8");

function section(name: string) {
  const body = config.split(`[${name}]`)[1];
  expect(body, `missing Codex table ${name}`).toBeDefined();
  return body!.split(/\r?\n\s*\[/u)[0];
}

describe("Codex shell environment contract", () => {
  it.each(["SystemDrive", "ProgramData"])("retains the Windows system path %s", (name) => {
    expect(section("shell_environment_policy.filters")).toMatch(
      new RegExp(`^${name}\\s*=\\s*"include"\\s*$`, "mi"),
    );
  });

  it("keeps automatic KEY/SECRET/TOKEN exclusions enabled", () => {
    expect(section("shell_environment_policy")).toMatch(
      /^ignore_default_excludes\s*=\s*false\s*$/mu,
    );
  });

  it.each([
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "CODEX_ACCESS_TOKEN",
    "GH_TOKEN",
    "GITHUB_TOKEN",
  ])("preserves the explicit secret exclusion for %s", (name) => {
    expect(section("shell_environment_policy.filters")).toMatch(
      new RegExp(`^${name}\\s*=\\s*"exclude"\\s*$`, "mi"),
    );
  });
});
