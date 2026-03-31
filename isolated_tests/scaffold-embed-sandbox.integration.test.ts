// @vitest-environment node
/**
 * Isolerat: manuell prompt → searchScaffolds (embeddings endast) → scaffold.files → buildCompleteProject → createSandboxRuntimeFromFiles.
 *
 * Hoppar över orchestrate, keyword-baserad matchScaffold och own-engine / LLM-generering.
 * I produktion mergar finalize-merge modellens filer med scaffold; här körs **scaffold-basen** oförändrad
 * för att isolera embedding + sandbox. Ett framtida steg vore att anropa en LLM som bara patchar t.ex. app/page.tsx.
 *
 * Vi använder inte `startSandboxPreview` här: den drar in `buildSandboxEnvLocalContents` → DB för projekt-env.
 * I stället samma filuppsättning som `buildCompleteProject` ger (inkl. placeholder-.env.local) — paritet med export/sandbox utan Postgres i testmiljö.
 *
 * Kräver OPENAI_API_KEY (query-embedding). Sandbox-steg kräver dessutom Vercel-auth + SANDBOX_INTEGRATION_TEST=1.
 * Utan det visas bara embedding-testet — ingen preview-URL (testet markeras som skipped).
 * `vitest` laddar inte automatiskt `.env.local` — använd `node --env-file=.env.local ./node_modules/vitest/vitest.mjs run …`
 * eller sätt variabler i shell, annars ser du inte sandbox-steget/URL.
 *
 * PowerShell-exempel:
 *   $env:SANDBOX_INTEGRATION_TEST="1"
 *   node --env-file=.env.local ./node_modules/vitest/vitest.mjs run isolated_tests/scaffold-embed-sandbox.integration.test.ts
 *
 * Låt sandlådan ligga kvar efter testet (testet anropar inte `Sandbox.stop()`):
 *   $env:SANDBOX_INTEGRATION_KEEP_OPEN="1"
 * Standard: sandlådan stängs strax efter lyckat test — inte “för evigt”. Med KEEP_OPEN stänger du själv i Vercel.
 * VM-livstid är ändå max åtta minuter (`SANDBOX_MAX_LIFETIME_MS` i `runtime-url.ts`) — Vercel stoppar vid timeout.
 *
 *   node --env-file=.env.local ./node_modules/vitest/vitest.mjs run isolated_tests/scaffold-embed-sandbox.integration.test.ts
 *
 * Egen prompt (testar embedding-match mot dina ord; åsidosätter standardprompten):
 *   SCAFFOLD_EMBED_TEST_PROMPT i `.env.local` eller i shell (en rad — för lång text, sätt i shell med citattecken).
 *   Exempel PowerShell:
 *     $env:SCAFFOLD_EMBED_TEST_PROMPT="En B2B SaaS landningssida med pricing och testimonialer"
 *     node --env-file=.env.local ./node_modules/vitest/vitest.mjs run isolated_tests/scaffold-embed-sandbox.integration.test.ts
 */
import { beforeAll, describe, expect, it } from "vitest";
import { SECRETS } from "@/lib/config";
import { buildCompleteProject } from "@/lib/gen/project-scaffold";
import type { CodeFile } from "@/lib/gen/parser";
import { searchScaffolds } from "@/lib/gen/scaffolds/scaffold-search";
import {
  createSandboxRuntimeFromFiles,
  isSandboxConfigured,
  SANDBOX_MAX_LIFETIME_MS,
  sandboxDevServerResponseLooksReady,
} from "@/lib/mcp/runtime-url";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";

/** Standardprompt om `SCAFFOLD_EMBED_TEST_PROMPT` inte är satt. */
const DEFAULT_EMBED_TEST_PROMPT =
  "En enkel personlig portfoliosajt för en fotograf: startsida med galleri, om mig, kontakt. Svensk ton, ren layout.";

function getEmbedTestPrompt(): string {
  const fromEnv = process.env.SCAFFOLD_EMBED_TEST_PROMPT?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return DEFAULT_EMBED_TEST_PROMPT;
}

function embedTestPromptIsFromEnv(): boolean {
  const fromEnv = process.env.SCAFFOLD_EMBED_TEST_PROMPT?.trim();
  return Boolean(fromEnv && fromEnv.length > 0);
}

const TOP_K_LOG = 5;

function logPromptAndMatches(
  label: string,
  prompt: string,
  results: ReadonlyArray<{ scaffold: { id: string }; score: number }>,
) {
  const src = embedTestPromptIsFromEnv()
    ? "SCAFFOLD_EMBED_TEST_PROMPT"
    : "DEFAULT_EMBED_TEST_PROMPT";
  const preview =
    prompt.length > 200 ? `${prompt.slice(0, 200)}…` : prompt;
  console.log(`\n[isolated_tests] ${label}`);
  console.log(`[isolated_tests] Promptkälla: ${src}`);
  console.log(`[isolated_tests] Prompt: ${preview}\n`);
  const n = Math.min(TOP_K_LOG, results.length);
  console.log(`[isolated_tests] Topp ${n} embedding-träff(ar):`);
  for (let i = 0; i < n; i++) {
    const r = results[i];
    console.log(
      `  ${i + 1}. ${r.scaffold.id}  score=${r.score.toFixed(4)}`,
    );
  }
  console.log("");
}

function scaffoldFilesToCodeFiles(
  files: ReadonlyArray<{ path: string; content: string }>,
): CodeFile[] {
  return files.map((f) => ({
    path: f.path,
    content: f.content,
    language: inferFileLanguage(f.path),
  }));
}

function hasLikelySandboxCredentials(): boolean {
  if (process.env.VERCEL_OIDC_TOKEN?.trim()) return true;
  const token = process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_TOKEN_FULL?.trim();
  const team = process.env.VERCEL_TEAM_ID?.trim() || process.env.VERCEL_ORG_ID?.trim();
  const project = process.env.VERCEL_PROJECT_ID?.trim();
  return Boolean(token && team && project);
}

describe("scaffold embed → sandbox (isolated)", () => {
  beforeAll(() => {
    const sandboxSkipped =
      process.env.SANDBOX_INTEGRATION_TEST !== "1" ||
      !hasLikelySandboxCredentials() ||
      !SECRETS.openaiApiKey;
    if (sandboxSkipped) {
      console.log(
        "\n[isolated_tests] Sandbox-steget hoppas över — ingen preview-URL. " +
          "Sätt SANDBOX_INTEGRATION_TEST=1 och Vercel-auth i .env.local " +
          "(VERCEL_OIDC_TOKEN från `vercel env pull`, eller VERCEL_TOKEN + VERCEL_TEAM_ID/VERCEL_ORG_ID + VERCEL_PROJECT_ID).\n",
      );
    }
  });

  it.skipIf(!SECRETS.openaiApiKey)(
    "searchScaffolds: minst en träff (standard- eller SCAFFOLD_EMBED_TEST_PROMPT)",
    async () => {
      const prompt = getEmbedTestPrompt();
      const results = await searchScaffolds(prompt, TOP_K_LOG);
      logPromptAndMatches("Embedding-sökning", prompt, results);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].scaffold.id.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(
    process.env.SANDBOX_INTEGRATION_TEST !== "1" ||
      !hasLikelySandboxCredentials() ||
      !SECRETS.openaiApiKey,
  )(
    "createSandboxRuntimeFromFiles med toppscaffold från embeddings (dev_only, utan DB)",
    async () => {
      if (!isSandboxConfigured()) {
        throw new Error("isSandboxConfigured() false — uppdatera .env.local");
      }
      const prompt = getEmbedTestPrompt();
      const results = await searchScaffolds(prompt, TOP_K_LOG);
      logPromptAndMatches("Sandbox bygger toppscaffold från samma prompt", prompt, results);
      expect(results.length).toBeGreaterThan(0);
      const codeFiles = scaffoldFilesToCodeFiles(results[0].scaffold.files);
      const projectFiles = buildCompleteProject(codeFiles);
      const runtimeFiles = projectFiles.map((f) => ({
        name: f.path,
        content: f.content,
      }));

      const runtime = await createSandboxRuntimeFromFiles(runtimeFiles, {
        sandboxPreviewMode: "dev_only",
        readinessProbe: true,
        timeoutMs: SANDBOX_MAX_LIFETIME_MS,
      });

      const url = runtime.primaryUrl?.trim();
      expect(url).toBeTruthy();
      console.log("[Sandbox preview — öppna i webbläsare]\n", url, "\n");
      const res = await fetch(url!, { headers: { Accept: "text/html" } });
      expect(sandboxDevServerResponseLooksReady(res)).toBe(true);

      if (process.env.SANDBOX_INTEGRATION_KEEP_OPEN === "1") {
        console.log(
          "[isolated_tests] SANDBOX_INTEGRATION_KEEP_OPEN=1 — stoppar inte sandlådan; stäng manuellt i Vercel-dashboard om du vill.\n",
        );
        return;
      }

      const { Sandbox } = await import("@vercel/sandbox");
      await Sandbox.get({ sandboxId: runtime.sandboxId })
        .then((s) => s.stop())
        .catch(() => {});
    },
    15 * 60_000,
  );
});
