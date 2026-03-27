/**
 * Smoke: Vercel Sandbox med standard Next-mall → npm install → npm run dev → HTTP med HTML.
 *
 *   $env:SANDBOX_INTEGRATION_TEST="1"
 *   node --env-file=.env.local ./node_modules/vitest/vitest.mjs run isolated_tests/sandbox-dev-homepage-smoke.test.ts
 *
 * För embedding → vald scaffold → sandbox (utan LLM), se scaffold-embed-sandbox.integration.test.ts.
 */
import { describe, expect, it } from "vitest";
import { sandboxDevServerResponseLooksReady } from "@/lib/mcp/runtime-url";

function hasLikelySandboxCredentials(): boolean {
  if (process.env.VERCEL_OIDC_TOKEN?.trim()) return true;
  const token = process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_TOKEN_FULL?.trim();
  const team = process.env.VERCEL_TEAM_ID?.trim() || process.env.VERCEL_ORG_ID?.trim();
  const project = process.env.VERCEL_PROJECT_ID?.trim();
  return Boolean(token && team && project);
}

describe.skipIf(
  process.env.SANDBOX_INTEGRATION_TEST !== "1" || !hasLikelySandboxCredentials(),
)("sandbox: dev homepage smoke", () => {
  it(
    "standardmall + npm install + dev ger svarande HTML på primaryUrl",
    async () => {
      const { createSandboxRuntimeFromFiles, isSandboxConfigured } = await import(
        "@/lib/mcp/runtime-url"
      );
      const { Sandbox } = await import("@vercel/sandbox");

      if (!isSandboxConfigured()) {
        throw new Error("isSandboxConfigured() false — uppdatera .env.local");
      }

      const result = await createSandboxRuntimeFromFiles([], {
        sandboxPreviewMode: "dev_only",
        readinessProbe: true,
        installCommand: "npm install",
        startCommand: "npm run dev",
        timeoutMs: 10 * 60_000,
      });

      const url = result.primaryUrl?.trim();
      expect(url).toBeTruthy();

      const res = await fetch(url!, {
        redirect: "follow",
        headers: { Accept: "text/html" },
      });
      expect(res.ok).toBe(true);
      expect(sandboxDevServerResponseLooksReady(res)).toBe(true);
      const text = await res.text();
      expect(text.length).toBeGreaterThan(100);
      expect(text.toLowerCase()).toMatch(/html|next|react|body/);

      await Sandbox.get({ sandboxId: result.sandboxId })
        .then((s) => s.stop())
        .catch(() => {});
    },
    12 * 60_000,
  );
});
