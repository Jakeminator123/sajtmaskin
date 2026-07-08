/**
 * Normalize legacy (v1) dossier prospects into v2 drafts — with a strict
 * LLM reviewer that is ALLOWED TO REJECT.
 *
 * Input:  a prospect folder OUTSIDE the repo (kept out of Cursor's index),
 *         seeded by copying candidate dossiers from the legacy archive:
 *           <root>/prospects.json                  — curation plan (fixed target id/class/capability per prospect)
 *           <root>/<legacyId>/manifest.json        — legacy v1 manifest
 *           <root>/<legacyId>/instructions.md
 *           <root>/<legacyId>/components/**        — extracted source files
 *
 * Output (per prospect, next to the input — NOT in data/dossiers/):
 *           <root>/<legacyId>/_v2-draft/manifest.json
 *           <root>/<legacyId>/_v2-draft/instructions.md
 *           <root>/<legacyId>/_v2-draft/components/**   (kept files, copied verbatim)
 *           <root>/<legacyId>/_v2-draft/REVIEW.md       (concerns + required code changes)
 *        or <root>/<legacyId>/REJECTED.md               (verdict + reason)
 *           <root>/normalization-report.json            (summary of the latest run per prospect)
 *
 * The LLM must output a verdict:
 *   - "accept": v2 manifest + instructions + which component files to keep.
 *   - "reject": a concrete reason ("inte bra nog eftersom …").
 * Accepted manifests are validated with the SAME AJV validator as runtime/CI
 * (`validateDossierManifest`) plus mechanical guards (soft ⇒ no build-env /
 * no server files; every manifest file must exist among kept components).
 *
 * Promotion to data/dossiers/{hard,soft}/ is a SEPARATE, manual step —
 * this script never touches the live pool. After promoting, run:
 *   npm run dossiers:validate-all && npm run dossiers:capability-map:write
 * …and wire the capability id into the brief prompt + follow-up vocabulary
 * (see prospects.json $comment) or the dossier will never be selected.
 *
 * Usage:
 *   npm run dossiers:normalize-legacy -- --only=<legacyId>
 *   npm run dossiers:normalize-legacy -- --all
 *   npm run dossiers:normalize-legacy -- --all --force --model=gpt-5.4-mini
 *   (default root: C:\Users\jakem\dev\projects\dossiers-prospect, override with --root=)
 *
 * Requires OPENAI_API_KEY (read from process.env, falling back to .env.local).
 * Cost: roughly $0.02–0.10 per dossier on the default model.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import OpenAI from "openai";

import { validateDossierManifest } from "../../src/lib/gen/dossiers/validate-manifest";

const REPO_ROOT = resolve(process.cwd());
// Prospect material lives OUTSIDE the repo (kept out of Cursor's index).
// Default: a sibling folder next to the repo root; override with
// DOSSIER_PROSPECT_ROOT or --root=. Kept in sync with the backoffice
// resolver in backoffice/pages/dossiers.py (_prospect_root).
const DEFAULT_PROSPECT_ROOT =
  process.env.DOSSIER_PROSPECT_ROOT?.trim() || resolve(REPO_ROOT, "..", "dossiers-prospect");
const DEFAULT_MODEL = "gpt-5.5";
/** Per-file cap keeps worst-case prompt size bounded (biggest prospect ≈ 30 kb total). */
const MAX_FILE_CHARS = 12_000;

interface ProspectPlan {
  legacyId: string;
  targetId: string;
  targetClass: "hard" | "soft";
  targetCapability: string;
  defaultForCapability: boolean;
  notes?: string;
}

interface Args {
  root: string;
  only: string | null;
  all: boolean;
  force: boolean;
  model: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    root: DEFAULT_PROSPECT_ROOT,
    only: null,
    all: false,
    force: false,
    model: DEFAULT_MODEL,
  };
  for (const a of argv.slice(2)) {
    if (a === "--all") args.all = true;
    else if (a === "--force") args.force = true;
    else if (a.startsWith("--only=")) args.only = a.slice("--only=".length);
    else if (a.startsWith("--root=")) args.root = a.slice("--root=".length);
    else if (a.startsWith("--model=")) args.model = a.slice("--model=".length);
  }
  if (!args.only && !args.all) {
    throw new Error("Pass --only=<legacyId> or --all");
  }
  return args;
}

/** Minimal .env.local fallback so the script runs outside `next dev`. */
function loadOpenAiKey(): string {
  const fromEnv = (process.env.OPENAI_API_KEY ?? "").trim();
  if (fromEnv) return fromEnv;
  const envLocal = join(REPO_ROOT, ".env.local");
  if (existsSync(envLocal)) {
    for (const line of readFileSync(envLocal, "utf-8").split(/\r?\n/)) {
      const m = line.match(/^\s*OPENAI_API_KEY\s*=\s*"?([^"\s#]+)"?\s*$/);
      if (m) return m[1];
    }
  }
  throw new Error("OPENAI_API_KEY not found in process.env or .env.local");
}

function listComponentFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    if (!existsSync(cur)) continue;
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      const full = join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out.sort();
}

function readCapped(path: string): string {
  const text = readFileSync(path, "utf-8");
  return text.length > MAX_FILE_CHARS ? text.slice(0, MAX_FILE_CHARS) + "\n…[truncated]" : text;
}

interface KeepFileMapping {
  /** Path exactly as provided in the prompt (relative to the prospect dir). */
  from: string;
  /** v2 dossier path ("components/..."), aligned with manifest.files[].path. */
  to: string;
}

interface ReviewOutput {
  verdict: "accept" | "reject";
  reason?: string;
  concerns?: string[];
  requiredCodeChanges?: string[];
  keepFiles?: KeepFileMapping[];
  manifest?: Record<string, unknown>;
  instructions?: string;
}

function buildSystemPrompt(plan: ProspectPlan): string {
  const today = new Date().toISOString().slice(0, 10);
  return `You are a STRICT reviewer + normalizer for "dossiers" — small reusable capability modules injected into a website-generation LLM pipeline (Sajtmaskin). You receive ONE legacy (v1) dossier: its old manifest, instructions and extracted source files. Your job:

A) Decide if this material is good enough to become a v2 dossier. If not, REJECT with a concrete reason (missing critical glue files, code that cannot work standalone, template-shaped code that wants to own the whole app, stale SDK usage, secrets handled unsafely, …). Rejecting is a GOOD outcome when deserved — do not rubber-stamp.

B) If acceptable, produce:
1. A v2 manifest JSON. The target identity is FIXED by the curation plan and MUST be used exactly:
   - id: "${plan.targetId}"
   - class: "${plan.targetClass}" (encoded by folder, NOT a manifest field — do not emit a "class" field)
   - capability: "${plan.targetCapability}"
   - defaultForCapability: ${plan.defaultForCapability}
   Manifest schema (additionalProperties=false — legacy fields like category/kind/qualityScore/tags/scaffoldFit/providers/description/_status MUST be dropped):
   {
     "id", "label" (2-80 chars), "capability", "codeFidelity": "verbatim"|"rewritable",
     "complexity": "simple"|"medium"|"advanced", "defaultForCapability": boolean,
     "summary" (30-600 chars, written for an LLM deciding WHEN to use the dossier, no marketing),
     "envVars": [{"key" (SCREAMING_SNAKE), "required": bool, "purpose" (10-400 chars),
                  "enforcement": "build"|"feature-runtime"|"warn-only"}],
     "dependencies": ["pkg" or "pkg@^x.y.z"],
     "files": [{"path" ("components/..."), "role": "client"|"server"|"shared",
                "injectionMode": "verbatim"|"rewritable" (optional per-file override)}],
     "exposes": [{"name", "type": "component"|"function"|"hook"|"constant", "import"}],
     "lastVerified": "${today}",
     "sourceRepoUrl" (optional), "notes" (optional, ≤600 chars, curator-facing),
     "promptInstructionMode": "compact"|"selected-sections"|"full" (optional)
   }
2. An instructions.md body with EXACTLY these H1 sections: "# When to use", "# How to integrate", "# UX rules", "# Avoid", "# Verification". Short concrete bullets, scaffold-agnostic.
3. keepFiles: the subset of provided component files worth shipping, as {from, to} mappings. "from" = the path exactly as given in the input. "to" = the v2 dossier path the file should live at, and MUST equal the corresponding manifest files[].path. Drop files that are app-specific filler.

Path mapping contract (how "to" paths land in the generated user project — pick "to" so imports in exposes resolve):
- "components/lib/<rel>"        → emitted at "lib/<rel>"        → import "@/lib/<rel-no-ext>"
- "components/api/<r>/route.ts" → emitted at "app/api/<r>/route.ts" (API routes; never importable)
- "components/middleware.ts", "components/instrumentation.ts", "components/sentry.*.config.ts" → emitted at project root
- "components/<name>.tsx" (and any other path) → emitted unchanged → import "@/components/<name>"
Legacy extracts often nest upstream layouts ("components/src/lib/x.ts", "components/frontend/sanity/lib/y.ts", "components/components/chat.tsx", "components/app/api/z/route.ts"). Re-root them: SDK/helper modules under "components/lib/**" (e.g. "components/lib/sanity/client.ts"), API routes under "components/api/**", UI components directly under "components/". Update exposes[].import accordingly — every exposes import must resolve to a kept file after the mapping above. If a kept file's internal relative imports would break under the new layout, list the needed adjustments in requiredCodeChanges.

Domain rules (Sajtmaskin contracts — violating these means reject or flag):
- A dossier is a NARROW capability module, not a mini-template. It must not own layout, global providers, or unrelated routes. Prefer fewer files.
- enforcement semantics: "build" = a real secret is required before the integrations build (F3) can succeed (placeholder crashes the deploy). "feature-runtime" = SDK imported but UI degrades gracefully (config banner / 503 route) when the value is missing. "warn-only" = code self-disables silently on empty value. Choose per key based on how the CODE actually behaves, not aspiration.
- Env-dependent SDK clients must NOT be constructed at module top-level (import-time crash breaks the enforcement contract). If the code does this, list it under requiredCodeChanges (accept) or reject if pervasive.
- codeFidelity: "verbatim" for integration glue (webhooks, auth callbacks, SDK init, API routes — protected from creative rewriting); "rewritable" for UI. Use per-file injectionMode when mixed.
- class "soft" must be fully self-contained: NO envVars with enforcement "build" and NO files with role "server". If the material cannot satisfy that, reject (the plan's class is fixed).
- envVars: only keys the shipped code actually reads. purpose should say what it does + where to get it.
- dependencies: only packages the kept files import. Prefer unpinned names unless a major-version pin is required.

Output ONLY the JSON object described by the response schema.`;
}

function buildUserPrompt(
  plan: ProspectPlan,
  legacyManifest: string,
  legacyInstructions: string | null,
  files: { relPath: string; body: string }[],
): string {
  const fileBlocks = files
    .map((f) => `### ${f.relPath}\n\`\`\`\n${f.body}\n\`\`\``)
    .join("\n\n");
  return `Curation plan for this prospect:
- legacyId: ${plan.legacyId}
- targetId: ${plan.targetId}
- targetClass: ${plan.targetClass}
- targetCapability: ${plan.targetCapability}
- defaultForCapability: ${plan.defaultForCapability}
- curator notes: ${plan.notes ?? "(none)"}

Legacy manifest.json (v1 — for context only, its fields are NOT valid v2):
\`\`\`json
${legacyManifest}
\`\`\`

Legacy instructions.md:
${legacyInstructions ? "```md\n" + legacyInstructions + "\n```" : "(missing)"}

Component files (${files.length}):

${fileBlocks}`;
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict"],
  properties: {
    verdict: { type: "string", enum: ["accept", "reject"] },
    reason: { type: "string", description: "Required when verdict=reject: concrete, specific." },
    concerns: { type: "array", items: { type: "string" } },
    requiredCodeChanges: {
      type: "array",
      items: { type: "string" },
      description: "Code fixes a human/agent must apply before promotion (e.g. lazy-init an SDK client).",
    },
    keepFiles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to"],
        properties: {
          from: { type: "string", description: "Input path exactly as given." },
          to: { type: "string", description: "v2 dossier path (components/...), equals manifest files[].path." },
        },
      },
    },
    manifest: { type: "object" },
    instructions: { type: "string" },
  },
} as const;

async function reviewProspect(
  openai: OpenAI,
  model: string,
  plan: ProspectPlan,
  prospectDir: string,
): Promise<ReviewOutput> {
  const legacyManifest = readCapped(join(prospectDir, "manifest.json"));
  const legacyInstructions = existsSync(join(prospectDir, "instructions.md"))
    ? readCapped(join(prospectDir, "instructions.md"))
    : null;
  const componentsDir = join(prospectDir, "components");
  const files = listComponentFiles(componentsDir).map((full) => ({
    relPath: "components/" + full.slice(componentsDir.length + 1).replace(/\\/g, "/"),
    body: readCapped(full),
  }));
  if (files.length === 0) {
    return { verdict: "reject", reason: "No component files found in prospect." };
  }

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildSystemPrompt(plan) },
      { role: "user", content: buildUserPrompt(plan, legacyManifest, legacyInstructions, files) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "DossierNormalization", strict: false, schema: RESPONSE_SCHEMA },
    },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");
  return JSON.parse(content) as ReviewOutput;
}

/**
 * True when `p` is a clean POSIX-relative path rooted at "components/" with no
 * empty / "." / ".." segments and no backslashes. Guards both keepFiles.to and
 * (transitively) manifest.files[].path, which must equal a keepFiles.to.
 */
function isSafeComponentsRelPath(p: string): boolean {
  if (typeof p !== "string" || p.includes("\\")) return false;
  const parts = p.split("/");
  if (parts[0] !== "components" || parts.length < 2) return false;
  return parts.every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

interface MechanicalCheckResult {
  ok: boolean;
  errors: string[];
}

/** Deterministic guards the LLM cannot talk its way past. */
function runMechanicalChecks(
  plan: ProspectPlan,
  output: ReviewOutput,
  prospectDir: string,
): MechanicalCheckResult {
  const errors: string[] = [];
  const manifest = output.manifest as
    | {
        envVars?: { key?: string; enforcement?: string }[];
        files?: { path?: string; role?: string }[];
      }
    | undefined;
  if (!manifest) return { ok: false, errors: ["verdict=accept but no manifest emitted"] };
  if (typeof output.instructions !== "string" || output.instructions.trim().length === 0) {
    errors.push("verdict=accept but no instructions emitted");
  } else {
    for (const section of ["# When to use", "# How to integrate", "# Avoid"]) {
      if (!output.instructions.includes(section)) {
        errors.push(`instructions.md missing required H1 section: "${section}"`);
      }
    }
  }
  const keeps = output.keepFiles ?? [];
  if (keeps.length === 0) errors.push("verdict=accept but keepFiles is empty");
  const keepTargets = new Set(keeps.map((k) => k.to));
  for (const k of keeps) {
    // Path-escape guard on BOTH ends: `from` is read (join(prospectDir, from))
    // and `to` is written (join(draftDir, to)). A traversal segment on either
    // (e.g. "components/../../secret") could read/write outside the intended
    // roots — legacy file bodies are in the prompt, so a prompt-injected
    // mapping must not turn normalization into arbitrary local file copy.
    if (!isSafeComponentsRelPath(k.from)) {
      errors.push(
        `keepFiles.from must be a clean "components/..." path (no "\\", ".", ".." segments): ${k.from}`,
      );
    } else if (!existsSync(join(prospectDir, k.from))) {
      errors.push(`keepFiles.from does not exist in prospect: ${k.from}`);
    }
    if (!isSafeComponentsRelPath(k.to)) {
      errors.push(
        `keepFiles.to must be a clean "components/..." path (no "\\", ".", ".." segments): ${k.to}`,
      );
    }
  }
  for (const file of manifest.files ?? []) {
    if (file.path && !keepTargets.has(file.path)) {
      errors.push(`manifest.files path not in keepFiles.to: ${file.path}`);
    }
  }
  if (plan.targetClass === "soft") {
    if ((manifest.envVars ?? []).some((e) => (e.enforcement ?? "build") === "build")) {
      errors.push("soft dossier must not have build-enforced envVars (dossierRequiresF3 would flip)");
    }
    if ((manifest.files ?? []).some((f) => f.role === "server")) {
      errors.push("soft dossier must not ship files with role 'server'");
    }
  }
  return { ok: errors.length === 0, errors };
}

interface ReportRow {
  legacyId: string;
  targetId: string;
  verdict: "accept" | "reject" | "invalid";
  reason?: string;
  concerns?: string[];
  requiredCodeChanges?: string[];
  validationErrors?: string[];
  model: string;
  at: string;
}

function writeDraft(
  plan: ProspectPlan,
  output: ReviewOutput,
  prospectDir: string,
): void {
  const draftDir = join(prospectDir, "_v2-draft");
  rmSync(draftDir, { recursive: true, force: true });
  mkdirSync(draftDir, { recursive: true });
  const manifest = {
    $schema: "../../../../docs/schemas/strict/dossier.schema.json",
    ...(output.manifest as Record<string, unknown>),
  };
  writeFileSync(join(draftDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  writeFileSync(join(draftDir, "instructions.md"), output.instructions ?? "", "utf-8");
  for (const k of output.keepFiles ?? []) {
    const src = join(prospectDir, k.from);
    const dst = join(draftDir, k.to);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
  }
  const review = [
    `# Review — ${plan.legacyId} → ${plan.targetClass}/${plan.targetId}`,
    "",
    "## Concerns",
    ...(output.concerns?.length ? output.concerns.map((c) => `- ${c}`) : ["- (none)"]),
    "",
    "## Required code changes before promotion",
    ...(output.requiredCodeChanges?.length
      ? output.requiredCodeChanges.map((c) => `- ${c}`)
      : ["- (none)"]),
    "",
    "## Promotion checklist",
    `- [ ] Copy _v2-draft/ to data/dossiers/${plan.targetClass}/${plan.targetId}/ (manifest.json, instructions.md, components/)`,
    "- [ ] Apply required code changes above",
    "- [ ] npm run dossiers:validate-all",
    "- [ ] npm run dossiers:capability-map:write",
    `- [ ] Wire capability '${plan.targetCapability}' into site-brief-generation.ts + follow-up-capability-vocabulary.ts (if new)`,
    "- [ ] Verify in a real preview build, then set lastVerified",
    "",
  ].join("\n");
  writeFileSync(join(draftDir, "REVIEW.md"), review, "utf-8");
}

async function main() {
  const args = parseArgs(process.argv);
  const root = resolve(args.root);
  const planPath = join(root, "prospects.json");
  if (!existsSync(planPath)) throw new Error(`prospects.json not found in ${root}`);
  const plans: ProspectPlan[] = JSON.parse(readFileSync(planPath, "utf-8")).prospects;

  const selected = plans.filter((p) => (args.only ? p.legacyId === args.only : true));
  if (selected.length === 0) throw new Error(`No prospect matches --only=${args.only}`);

  // Tracks whether any prospect ended `invalid` (LLM accepted but the draft
  // failed AJV/mechanical validation). Rejects are a normal outcome and keep
  // exit 0; an invalid is a real defect, so we exit non-zero at the end so the
  // backoffice batch buttons don't render a green banner over a failed run.
  let anyInvalid = false;

  const openai = new OpenAI({ apiKey: loadOpenAiKey() });
  const reportPath = join(root, "normalization-report.json");
  const report: Record<string, ReportRow> = existsSync(reportPath)
    ? JSON.parse(readFileSync(reportPath, "utf-8"))
    : {};

  for (const plan of selected) {
    const prospectDir = join(root, plan.legacyId);
    if (!existsSync(prospectDir)) {
      console.warn(`[skip] ${plan.legacyId}: folder missing`);
      continue;
    }
    const alreadyDone =
      existsSync(join(prospectDir, "_v2-draft", "manifest.json")) ||
      existsSync(join(prospectDir, "REJECTED.md"));
    if (alreadyDone && !args.force) {
      console.log(`[skip] ${plan.legacyId}: already processed (use --force to redo)`);
      continue;
    }

    console.log(`[normalize] ${plan.legacyId} → ${plan.targetClass}/${plan.targetId} (${args.model})`);
    const t0 = Date.now();
    const output = await reviewProspect(openai, args.model, plan, prospectDir);
    const elapsed = Math.round((Date.now() - t0) / 1000);

    const row: ReportRow = {
      legacyId: plan.legacyId,
      targetId: plan.targetId,
      verdict: output.verdict,
      reason: output.reason,
      concerns: output.concerns,
      requiredCodeChanges: output.requiredCodeChanges,
      model: args.model,
      at: new Date().toISOString(),
    };

    if (output.verdict === "reject") {
      rmSync(join(prospectDir, "_v2-draft"), { recursive: true, force: true });
      writeFileSync(
        join(prospectDir, "REJECTED.md"),
        `# Rejected — ${plan.legacyId}\n\n${output.reason ?? "(no reason given)"}\n\nModel: ${args.model} · ${row.at}\n`,
        "utf-8",
      );
      console.log(`[reject] ${plan.legacyId} (${elapsed}s): ${output.reason}`);
    } else if (!output.manifest || typeof output.manifest !== "object") {
      // The response schema only requires `verdict`; an accept with no manifest
      // must fail THIS prospect (not throw on the `.id =` write below and abort
      // the whole run before later prospects/report rows are processed).
      row.verdict = "invalid";
      row.validationErrors = ["verdict=accept but no manifest object emitted"];
      anyInvalid = true;
      rmSync(join(prospectDir, "_v2-draft"), { recursive: true, force: true });
      console.error(`[invalid] ${plan.legacyId} (${elapsed}s): accepted with no manifest object`);
    } else {
      // Coerce plan-owned fields (id + capability + default flag) so the LLM
      // cannot drift the fixed identity in prospects.json past validation and
      // land a dossier the runtime would select under the wrong capability.
      const manifest = output.manifest as Record<string, unknown>;
      manifest.id = plan.targetId;
      manifest.capability = plan.targetCapability;
      manifest.defaultForCapability = plan.defaultForCapability;
      const ajv = validateDossierManifest(output.manifest, {
        expectedId: plan.targetId,
        class: plan.targetClass,
      });
      const mech = runMechanicalChecks(plan, output, prospectDir);
      const validationErrors = [...(ajv.valid ? [] : ajv.errors), ...mech.errors];
      if (validationErrors.length > 0) {
        row.verdict = "invalid";
        row.validationErrors = validationErrors;
        anyInvalid = true;
        // Remove any prior draft so a stale (previously-accepted) _v2-draft/
        // can't linger and be promoted after a later run went invalid.
        rmSync(join(prospectDir, "_v2-draft"), { recursive: true, force: true });
        console.error(
          `[invalid] ${plan.legacyId} (${elapsed}s): accepted by LLM but failed validation:\n  - ${validationErrors.join("\n  - ")}`,
        );
      } else {
        rmSync(join(prospectDir, "REJECTED.md"), { force: true });
        writeDraft(plan, output, prospectDir);
        console.log(
          `[accept] ${plan.legacyId} (${elapsed}s) → _v2-draft/ (${output.keepFiles?.length ?? 0} files, ${output.concerns?.length ?? 0} concerns, ${output.requiredCodeChanges?.length ?? 0} required changes)`,
        );
      }
    }

    report[plan.legacyId] = row;
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
  }

  const rows = Object.values(report);
  console.log(
    `\n[done] report: ${reportPath}\n  accept: ${rows.filter((r) => r.verdict === "accept").length} · reject: ${rows.filter((r) => r.verdict === "reject").length} · invalid: ${rows.filter((r) => r.verdict === "invalid").length}`,
  );
  if (anyInvalid) {
    // Non-zero so callers (backoffice batch buttons) surface it as a failure.
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
