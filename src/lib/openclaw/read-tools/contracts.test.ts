import { describe, expect, it } from "vitest";
import { OPENCLAW_READ_TOOL_DEFINITIONS, parseOpenClawReadToolCall } from "./contracts";
import {
  OPENCLAW_READ_SESSION_MAX_TTL_MS,
  clampOpenClawReadSessionTtl,
  isSensitiveOpenClawReadPath,
  normalizeOpenClawReadPath,
} from "./policy";

describe("OpenClaw read-tool contracts", () => {
  it("never exposes server-owned target or credential fields to the model", () => {
    const serialized = JSON.stringify(OPENCLAW_READ_TOOL_DEFINITIONS);
    for (const forbidden of [
      "chatId",
      "projectId",
      "tenantId",
      "userId",
      "versionId",
      "filesRevision",
      "previewSessionId",
      "previewUrl",
      "authorization",
      "credential",
      "shell",
      "command",
    ]) {
      expect(serialized).not.toContain(`\"${forbidden}\"`);
    }
  });

  it("makes every strict-mode property required and represents optional values as nullable", () => {
    for (const definition of OPENCLAW_READ_TOOL_DEFINITIONS) {
      const parameters = definition.function.parameters as {
        properties: Record<string, unknown>;
        required: string[];
        additionalProperties: boolean;
      };
      expect(parameters.additionalProperties).toBe(false);
      expect([...parameters.required].sort()).toEqual(Object.keys(parameters.properties).sort());
    }
  });

  it("normalizes strict-mode null sentinels to server-side defaults", () => {
    const parsed = parseOpenClawReadToolCall({
      name: "project_search_code",
      arguments: {
        query: "needle",
        pathPrefix: null,
        caseSensitive: null,
        limit: null,
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.call.name !== "project_search_code") return;
    expect(parsed.call.arguments).toEqual({
      query: "needle",
      pathPrefix: undefined,
      caseSensitive: undefined,
      limit: undefined,
    });
  });

  it("rejects unknown tools, malformed JSON and injected target fields", () => {
    expect(parseOpenClawReadToolCall({ name: "run_shell", arguments: {} }).ok).toBe(false);
    expect(parseOpenClawReadToolCall({ name: "project_get_version", arguments: "{" }).ok).toBe(
      false,
    );
    expect(
      parseOpenClawReadToolCall({
        name: "project_read_file",
        arguments: { path: "app/page.tsx", versionId: "attacker-version" },
      }).ok,
    ).toBe(false);
  });

  it.each([
    "../outside.ts",
    "src/../../outside.ts",
    "/etc/passwd",
    "C:\\Users\\owner\\.ssh\\id_rsa",
    "src\\..\\.env",
    "src//page.tsx",
  ])("rejects unsafe project path %s", (path) => {
    expect(normalizeOpenClawReadPath(path)).toBeNull();
  });

  it.each([
    ".env",
    "config/.env.production",
    "package-lock.json",
    "secrets/credentials.json",
    "keys/id_rsa",
    "certs/client.pem",
    ".npmrc",
    "service-account.json",
    "release.keystore",
  ])("classifies sensitive path %s as restricted", (path) => {
    expect(isSensitiveOpenClawReadPath(path)).toBe(true);
  });

  it("caps session TTL and rejects non-positive effective lifetimes", () => {
    expect(clampOpenClawReadSessionTtl(undefined)).toBe(OPENCLAW_READ_SESSION_MAX_TTL_MS);
    expect(clampOpenClawReadSessionTtl(Number.POSITIVE_INFINITY)).toBe(
      OPENCLAW_READ_SESSION_MAX_TTL_MS,
    );
    expect(clampOpenClawReadSessionTtl(10 * OPENCLAW_READ_SESSION_MAX_TTL_MS)).toBe(
      OPENCLAW_READ_SESSION_MAX_TTL_MS,
    );
    expect(clampOpenClawReadSessionTtl(0)).toBe(1);
  });
});
