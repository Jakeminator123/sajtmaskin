import { describe, expect, it } from "vitest";

import { normalizeImportedPath } from "./local-v0-template-source";

describe("normalizeImportedPath — env-file blocklist (#38)", () => {
  it("drops apex .env files so they are never imported", () => {
    expect(normalizeImportedPath(".env")).toBeNull();
    expect(normalizeImportedPath(".env.local")).toBeNull();
    expect(normalizeImportedPath(".env.production")).toBeNull();
    expect(normalizeImportedPath(".env.development")).toBeNull();
    expect(normalizeImportedPath(".env.example")).toBeNull();
  });

  it("drops .env files nested under a directory", () => {
    expect(normalizeImportedPath("config/.env")).toBeNull();
    expect(normalizeImportedPath("apps/web/.env.local")).toBeNull();
    expect(normalizeImportedPath("packages/api/.env.production")).toBeNull();
  });

  it("keeps ordinary source files unaffected", () => {
    expect(normalizeImportedPath("app/page.tsx")).toBe("app/page.tsx");
    expect(normalizeImportedPath("README.md")).toBe("README.md");
    expect(normalizeImportedPath("package.json")).toBe("package.json");
    // A basename that merely ends in `.env` (not a dotfile) is not an env file.
    expect(normalizeImportedPath("src/config.env.ts")).toBe("src/config.env.ts");
  });

  it("still rejects unsafe / escaping paths", () => {
    expect(normalizeImportedPath("../secrets")).toBeNull();
    expect(normalizeImportedPath("node_modules/foo/index.js")).toBeNull();
  });
});
