import { describe, expect, it } from "vitest";
import { isBlockedEnvImportFilename } from "./env-import-guard";

describe("isBlockedEnvImportFilename (#38 template .env import block)", () => {
  it("blocks real env files", () => {
    expect(isBlockedEnvImportFilename(".env")).toBe(true);
    expect(isBlockedEnvImportFilename(".env.local")).toBe(true);
    expect(isBlockedEnvImportFilename(".env.production")).toBe(true);
    expect(isBlockedEnvImportFilename(".env.development")).toBe(true);
    expect(isBlockedEnvImportFilename(".env.test")).toBe(true);
    expect(isBlockedEnvImportFilename(".ENV")).toBe(true);
  });

  it("allows documentation-only variants (no secret values)", () => {
    expect(isBlockedEnvImportFilename(".env.example")).toBe(false);
    expect(isBlockedEnvImportFilename(".env.sample")).toBe(false);
    expect(isBlockedEnvImportFilename(".env.template")).toBe(false);
  });

  it("does not touch unrelated files", () => {
    expect(isBlockedEnvImportFilename("package.json")).toBe(false);
    expect(isBlockedEnvImportFilename("env.ts")).toBe(false);
    expect(isBlockedEnvImportFilename("readme.md")).toBe(false);
  });
});
