/**
 * Isolerad testyta: sandbox + shell-strängar.
 *
 * Kör integration mot Vercel Sandbox (kostar API-anrop):
 *   $env:SANDBOX_INTEGRATION_TEST="1"; npx vitest run isolated_tests/sandbox-shell-chaining.test.ts
 *
 * Kräver VERCEL_OIDC_TOKEN eller VERCEL_TOKEN + team/project enligt docs.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

/** Samma fält som `src/app/api/sandbox/route.ts` createSandboxSchema (install/start). */
const sandboxCommandFields = z.object({
  installCommand: z.string().optional().default("npm install"),
  startCommand: z.string().optional().default("npm run dev"),
});

/** Grov synk-koll (samma idé som `isSandboxConfigured`) så `it.skipIf` kan användas utan att ladda hela runtime-url. */
function hasLikelySandboxCredentials(): boolean {
  if (process.env.VERCEL_OIDC_TOKEN?.trim()) return true;
  const token = process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_TOKEN_FULL?.trim();
  const team = process.env.VERCEL_TEAM_ID?.trim() || process.env.VERCEL_ORG_ID?.trim();
  const project = process.env.VERCEL_PROJECT_ID?.trim();
  return Boolean(token && team && project);
}

describe("sandbox API / runtime: shell strings", () => {
  it("accepterar && och annan shell-syntax i installCommand/startCommand (ingen allowlist)", () => {
    const parsed = sandboxCommandFields.parse({
      installCommand: "npm install && echo post-install",
      startCommand: "npm run dev || true",
    });
    expect(parsed.installCommand).toContain("&&");
    expect(parsed.startCommand).toContain("||");
  });

  it("default är npm install / npm run dev (två separata bash -c i runtime-url, inte en sträng)", () => {
    const parsed = sandboxCommandFields.parse({});
    expect(parsed.installCommand).toBe("npm install");
    expect(parsed.startCommand).toBe("npm run dev");
  });
});

describe("createSandboxRuntimeFromFiles (live, optional)", () => {
  it.skipIf(
    process.env.SANDBOX_INTEGRATION_TEST !== "1" || !hasLikelySandboxCredentials(),
  )(
    "kör hela installCommand som ett bash -c: true && false ger fel (&& är aktivt)",
    async () => {
      const { createSandboxRuntimeFromFiles, isSandboxConfigured } = await import(
        "@/lib/mcp/runtime-url"
      );
      if (!isSandboxConfigured()) {
        throw new Error("Sandbox credentials ogiltiga eller utgångna (isSandboxConfigured === false)");
      }
      await expect(
        createSandboxRuntimeFromFiles([], {
          installCommand: "true && false",
          startCommand: "npm run dev",
          sandboxPreviewMode: "dev_only",
          readinessProbe: false,
          timeoutMs: 120_000,
        }),
      ).rejects.toThrow(/npm install failed/);
    },
  );
  // Om du sätter installCommand till "npm install && npm run dev" blockeras install-steget:
  // `npm run dev` avslutas inte, så runCommand returnerar inte (tills VM-timeout).
});
