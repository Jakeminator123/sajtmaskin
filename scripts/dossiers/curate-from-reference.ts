/**
 * AI-curate a single dossier from a template-reference repo.
 *
 * Usage:
 *   npx tsx scripts/dossiers/curate-from-reference.ts \
 *     --reference=ai-fal-image-generator \
 *     --class=hard \
 *     --id=fal-image-generator
 *
 * Reads:
 *   - data/template-references/repos/<reference>/  (cloned repo)
 *   - data/template-references/_metadata/<...>.json   (optional GitHub stars / pushed-at)
 *
 * Writes (draft, must be hand-reviewed):
 *   - data/dossiers/<class>/<id>/manifest.json
 *   - data/dossiers/<class>/<id>/instructions.md
 *
 * Behavior:
 *   - Reads README.md, package.json, .env.example, and a sample of source files.
 *   - Calls OpenAI gpt-4o-mini with a structured prompt to produce a v2 manifest.
 *   - Writes a draft. Will refuse to overwrite an existing dossier unless --force.
 *
 * Cost: ~$0.01-0.05 per dossier. Latency: ~10-30s.
 *
 * NOTE: This is the *only* dossier script. The legacy 16-script pipeline
 * was archived 2026-04-20 to archive/dossiers-legacy-2026-04-20/scripts/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import OpenAI from "openai";

import { validateDossierManifest } from "../../src/lib/gen/dossiers/validate-manifest";

const REPO_ROOT = resolve(process.cwd());
const REFERENCES_ROOT = join(REPO_ROOT, "data", "template-references", "repos");
const METADATA_ROOT = join(REPO_ROOT, "data", "template-references", "_metadata");
const DOSSIERS_ROOT = join(REPO_ROOT, "data", "dossiers");

interface Args {
  reference: string;
  class: "hard" | "soft";
  id: string;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { force: false };
  for (const a of argv.slice(2)) {
    if (a === "--force") args.force = true;
    else if (a.startsWith("--reference=")) args.reference = a.slice("--reference=".length);
    else if (a.startsWith("--class=")) {
      const v = a.slice("--class=".length);
      if (v !== "hard" && v !== "soft") throw new Error(`--class must be 'hard' or 'soft' (got: ${v})`);
      args.class = v;
    } else if (a.startsWith("--id=")) args.id = a.slice("--id=".length);
  }
  if (!args.reference) throw new Error("--reference=<id> is required");
  if (!args.class) throw new Error("--class=hard|soft is required");
  if (!args.id) throw new Error("--id=<dossier-id> is required");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(args.id)) {
    throw new Error(`--id must be kebab-case (got: ${args.id})`);
  }
  return args as Args;
}

function readIfExists(path: string, maxChars = 8_000): string | null {
  if (!existsSync(path)) return null;
  try {
    const text = readFileSync(path, "utf-8");
    return text.length > maxChars ? text.slice(0, maxChars) + "\n…[truncated]" : text;
  } catch {
    return null;
  }
}

function listSourceFiles(refDir: string, maxFiles = 6): string[] {
  const candidates: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > 4 || candidates.length >= maxFiles * 4) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.name === "node_modules" || e.name === "out" || e.name === ".next") continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1);
      } else if (/\.(tsx?|jsx?|css|json)$/.test(e.name) && e.name !== "package-lock.json") {
        candidates.push(full);
      }
    }
  }
  walk(refDir, 0);
  return candidates
    .sort((a, b) => {
      const score = (p: string) =>
        (p.includes("/api/") ? 100 : 0) +
        (p.endsWith("route.ts") ? 50 : 0) +
        (/components\//.test(p) ? 20 : 0) +
        (/lib\//.test(p) ? 10 : 0);
      return score(b) - score(a);
    })
    .slice(0, maxFiles);
}

function readMetadata(referenceId: string): string | null {
  if (!existsSync(METADATA_ROOT)) return null;
  const metaFiles = readdirSync(METADATA_ROOT).filter(
    (f) => f.includes(referenceId.replace(/^(ai|auth|cms|database|payments|realtime|ui-content|ui-marketing)-/, "")) && f.endsWith(".github.json"),
  );
  if (metaFiles.length === 0) return null;
  return readIfExists(join(METADATA_ROOT, metaFiles[0]), 2_000);
}

interface DraftManifest {
  id: string;
  label: string;
  capability: string;
  codeFidelity: "verbatim" | "rewritable";
  complexity: "simple" | "medium" | "advanced";
  defaultForCapability: boolean;
  summary: string;
  envVars?: { key: string; required: boolean; purpose: string }[];
  dependencies?: string[];
  files?: { path: string; role: "client" | "server" | "shared"; injectionMode?: "verbatim" | "rewritable" }[];
  exposes?: { name: string; type: "component" | "function" | "hook" | "constant"; import: string }[];
  lastVerified: string;
  sourceRepoUrl?: string;
  notes?: string;
}

interface CurationOutput {
  manifest: DraftManifest;
  instructions: string;
}

/**
 * Curation-output guard: same AJV validator as registry-runtime + CI + backoffice.
 *
 * Fas 2·D — single source of truth. Replaces the previous handwritten
 * `assertManifestShape` which mirrored (and drifted from) the canonical
 * `docs/schemas/strict/dossier.schema.json`. Now both paths converge on
 * `validateDossierManifest`.
 *
 * We force `manifest.id` to `expectedId` BEFORE validation so the LLM's
 * occasional id-typos don't cause rejection (caller already sets this again
 * after curation — we do it here so the `id` regex + match check pass).
 */
function assertCurationOutput(
  value: unknown,
  expectedId: string,
  klass: "hard" | "soft",
): asserts value is CurationOutput {
  if (!value || typeof value !== "object") {
    throw new Error("LLM response is not a JSON object");
  }
  const root = value as Record<string, unknown>;
  if (typeof root.instructions !== "string" || root.instructions.trim().length === 0) {
    throw new Error("LLM response is missing `instructions` (non-empty string)");
  }
  if (!root.manifest || typeof root.manifest !== "object") {
    throw new Error("LLM response is missing `manifest` object");
  }
  // Coerce id before validation so the caller's --id argument wins over the
  // LLM's guess and the kebab-case regex check passes consistently.
  (root.manifest as Record<string, unknown>).id = expectedId;
  const result = validateDossierManifest(root.manifest, { expectedId, class: klass });
  if (!result.valid) {
    throw new Error(
      `LLM manifest failed schema validation:\n  - ${result.errors.join("\n  - ")}`,
    );
  }
}

async function callLLM(args: Args, sources: { name: string; body: string }[]): Promise<CurationOutput> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  const openai = new OpenAI({ apiKey });

  const today = new Date().toISOString().slice(0, 10);
  const sourcesBlock = sources
    .map((s) => `### ${s.name}\n\`\`\`\n${s.body}\n\`\`\``)
    .join("\n\n");

  const system = `You are curating a dossier (a reusable building block) for a website-generation pipeline. Read the provided template repo and produce:

1. A JSON manifest matching this exact schema:
{
  "id": "<kebab-case>",
  "label": "<short human label>",
  "capability": "<single kebab-case capability the dossier delivers, e.g. 'payments', 'auth', 'ai-chat', 'image-gen', 'pricing-section', 'visual-3d'>",
  "codeFidelity": "verbatim" | "rewritable",
  "complexity": "simple" | "medium" | "advanced",
  "defaultForCapability": false,
  "summary": "<1-3 sentences: what it does + when to use it>",
  "envVars": [{"key":"FOO","required":true,"purpose":"<concrete reason>"}],
  "dependencies": ["..."],
  "files": [{"path":"components/<...>","role":"client|server|shared","injectionMode":"verbatim|rewritable"}],
  "exposes": [{"name":"X","type":"component","import":"@/components/x"}],
  "lastVerified": "${today}",
  "sourceRepoUrl": "<url if known>"
}

Rules:
- Class is "${args.class}" (already decided): hard = needs external secrets, soft = self-contained.
- codeFidelity: "verbatim" for integration glue (auth callbacks, webhooks, SDK init, api-routes); "rewritable" for UI components.
- envVars: only ones that come from the .env.example AND are actually used in the source code. Skip placeholders.
- files: list only files that should be injected into the user's project. Strip the upstream's "src/" prefix; output paths should start with "components/".
- summary: write it for an LLM that needs to decide *when* to use this dossier. No marketing language.

2. An instructions.md body with these exact sections:
# When to use
# How to integrate
# UX rules
# Avoid
# Verification

Each section: short, concrete bullets. Scaffold-agnostic. No "if you use scaffold X" copy.`;

  const user = `Curate a dossier from this reference repo.

Reference id: ${args.reference}
Target class: ${args.class}
Target dossier id: ${args.id}

Source material:

${sourcesBlock}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "DossierCuration",
        // strict mode requires every property to be in `required`, which would
        // force the LLM to emit empty arrays for `envVars`/`dependencies`/`files`/
        // `exposes` even on soft self-contained dossiers — and that contradicts
        // `docs/schemas/strict/dossier.schema.json` (the canonical schema), where
        // those fields are optional. We mirror the strict schema's required-set
        // here and run a post-call sanity check (`assertManifestShape`) instead.
        strict: false,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["manifest", "instructions"],
          properties: {
            manifest: {
              type: "object",
              additionalProperties: false,
              required: [
                "id", "label", "capability", "codeFidelity", "complexity",
                "summary", "lastVerified",
              ],
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                capability: { type: "string" },
                codeFidelity: { type: "string", enum: ["verbatim", "rewritable"] },
                complexity: { type: "string", enum: ["simple", "medium", "advanced"] },
                defaultForCapability: { type: "boolean" },
                summary: { type: "string" },
                envVars: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["key", "required", "purpose"],
                    properties: {
                      key: { type: "string" },
                      required: { type: "boolean" },
                      purpose: { type: "string" },
                    },
                  },
                },
                dependencies: { type: "array", items: { type: "string" } },
                files: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["path", "role"],
                    properties: {
                      path: { type: "string" },
                      role: { type: "string", enum: ["client", "server", "shared"] },
                      injectionMode: { type: "string", enum: ["verbatim", "rewritable"] },
                    },
                  },
                },
                exposes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "type", "import"],
                    properties: {
                      name: { type: "string" },
                      type: { type: "string", enum: ["component", "function", "hook", "constant"] },
                      import: { type: "string" },
                    },
                  },
                },
                lastVerified: { type: "string" },
                sourceRepoUrl: { type: "string" },
              },
            },
            instructions: { type: "string" },
          },
        },
      },
    },
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");
  const parsed: unknown = JSON.parse(content);
  assertCurationOutput(parsed, args.id, args.class);
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv);

  // Path-traversal guard on --reference. The script is local-only but CI/cron
  // could pass user input; reject anything that escapes template-references/repos/.
  // Enstaka katalognamn (`/` och `\` avvisas nedan) — konservativ
  // substring-avvisning kan inte tappa legitima referenser.
  if (
    args.reference.includes("..") || // traversal-substring-allow
    args.reference.includes("/") ||
    args.reference.includes("\\")
  ) {
    throw new Error(
      `--reference must be a single directory name (no path segments). Got: ${args.reference}`,
    );
  }
  const refDir = resolve(REFERENCES_ROOT, args.reference);
  const sep = process.platform === "win32" ? "\\" : "/";
  if (!refDir.startsWith(REFERENCES_ROOT + sep)) {
    throw new Error(`--reference resolves outside template-references: ${refDir}`);
  }
  if (!existsSync(refDir)) {
    throw new Error(`Reference repo not found: ${refDir}`);
  }
  const targetDir = join(DOSSIERS_ROOT, args.class, args.id);
  if (existsSync(join(targetDir, "manifest.json")) && !args.force) {
    throw new Error(`Dossier already exists: ${targetDir}\nUse --force to overwrite.`);
  }

  const sources: { name: string; body: string }[] = [];
  for (const candidate of ["README.md", "readme.md", "package.json", ".env.example", "components.json"]) {
    const body = readIfExists(join(refDir, candidate));
    if (body) sources.push({ name: candidate, body });
  }
  for (const path of listSourceFiles(refDir)) {
    const body = readIfExists(path);
    if (body) sources.push({ name: path.replace(refDir + "\\", "").replace(refDir + "/", ""), body });
  }
  const meta = readMetadata(args.reference);
  if (meta) sources.push({ name: "_metadata.github.json", body: meta });

  if (sources.length === 0) {
    throw new Error(`No readable source files found in ${refDir}`);
  }

  console.log(`[curate] reference=${args.reference} class=${args.class} id=${args.id}`);
  console.log(`[curate] sources: ${sources.length} file(s) sampled`);
  console.log(`[curate] calling OpenAI…`);

  const t0 = Date.now();
  const output = await callLLM(args, sources);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`[curate] ✓ LLM responded in ${elapsed}s`);

  // Sanity-check: enforce the id/class the user asked for.
  output.manifest.id = args.id;
  if (!output.manifest.lastVerified) output.manifest.lastVerified = new Date().toISOString().slice(0, 10);

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(
    join(targetDir, "manifest.json"),
    JSON.stringify({ $schema: "../../../../docs/schemas/strict/dossier.schema.json", ...output.manifest }, null, 2) + "\n",
    "utf-8",
  );
  writeFileSync(join(targetDir, "instructions.md"), output.instructions, "utf-8");

  console.log(`[curate] wrote ${join(targetDir, "manifest.json")}`);
  console.log(`[curate] wrote ${join(targetDir, "instructions.md")}`);
  console.log(`[curate] DONE — review the draft and edit before relying on it.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
