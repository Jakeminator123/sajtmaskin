/**
 * Dossier pool blocks: Available Dossiers + Selected Instructions +
 * Verbatim Files.
 *
 * Split out of `system-prompt.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import { debugLog } from "@/lib/utils/debug";
import {
  defaultInjectionMode,
  getDossierFileContent,
  type DossierSelectionResult,
} from "../../dossiers";
import { mapDossierPathToOutput } from "../../dossiers/output-path";

// Paths that belong to the scaffold and are dangerous to overwrite via a
// dossier verbatim block (would clobber fonts, providers, metadata). We
// skip these even if a dossier asks for verbatim — log so we can spot
// dossier-data that needs fixing.
const SCAFFOLD_RESERVED_PATHS = new Set([
  "app/layout.tsx",
  "app/globals.css",
  "app/loading.tsx",
  "app/error.tsx",
  "app/not-found.tsx",
  "app/template.tsx",
  "package.json",
  "tsconfig.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "tailwind.config.ts",
  "postcss.config.mjs",
]);

interface VerbatimFile {
  dossierId: string;
  dossierLabel: string;
  relPath: string;
  /** Output path in the generated project (without dossier `components/` prefix). */
  outputPath: string;
  /** File extension fence language for CodeProject blocks. */
  fence: string;
  content: string;
}

interface DossierRenderOptions {
  generationMode?: "init" | "followUp";
  requestedCapabilityTiers?: Record<string, string> | null;
}

function shouldUseFullInstructions(
  sel: DossierSelectionResult["selected"][number],
  opts: DossierRenderOptions,
): boolean {
  if (opts.generationMode !== "followUp") return false;
  if (sel.entry.id !== "three-fiber-canvas") return false;
  const tier = opts.requestedCapabilityTiers?.[sel.entry.capability];
  // Beyond-dossier means the user asks for behavior outside the standard
  // ThreeCanvasShell recipe. Keep the full author instructions for that rare
  // case; normal init/follow-up paths use compact manifest-derived guidance.
  return tier === "beyond-dossier";
}

function renderCompactDossierInstructions(
  sel: DossierSelectionResult["selected"][number],
): string[] {
  const exposed = (sel.entry.exposes ?? [])
    .map((item) => `${item.name} from \`${item.import}\``)
    .join(", ");
  const dependencies = (sel.entry.dependencies ?? []).join(", ");
  const envVars = (sel.entry.envVars ?? [])
    .map((envVar) => {
      const required = envVar.required ? "required" : "optional";
      return `${envVar.key} (${required})`;
    })
    .join(", ");
  const configuredLine =
    sel.entry.class === "hard"
      ? sel.configured
        ? "- Configured hard dossier: real provider values may be used only in F3/integration context."
        : "- Unconfigured hard dossier: render placeholder-safe UI; do not require real env values in F2."
      : "- Soft dossier: use the pattern only where it directly supports the requested capability.";

  return [
    `### ${sel.entry.label} (\`${sel.entry.id}\`) — compact instructions`,
    "",
    `- ${sel.entry.summary}`,
    configuredLine,
    `- Capability: \`${sel.entry.capability}\`; code fidelity: ${sel.entry.codeFidelity}.`,
    dependencies ? `- Dependencies if used: ${dependencies}.` : "- Dependencies: none beyond the scaffold baseline.",
    envVars ? `- Env vars: ${envVars}.` : "- Env vars: none.",
    exposed ? `- Preserve exposed import(s): ${exposed}.` : "- No exposed imports.",
    "- Use this dossier only for the selected capability; do not let it expand unrelated scope.",
    "- If a verbatim file block follows, emit that file exactly and adapt behavior in separate/wrapper files.",
    "",
  ];
}

export function renderDossierBlocks(
  dossierSel: DossierSelectionResult | null | undefined,
  opts: DossierRenderOptions = {},
): string[] {
  if (!dossierSel || dossierSel.selected.length === 0) return [];

  const parts: string[] = [];

  // ── Available Dossiers + Selected Instructions (pool-modellen) ────────
  // Två block:
  //   ## Available Dossiers — kompakt lista av valda legoklossar (LLM ser
  //      vad som finns att stoppa in om prompten begär det)
  //   ## Selected Dossier Instructions — compact runtime instructions per vald
  //      dossier. Full instructions.md stays on disk for authors/debugging;
  //      verbatim code still renders in its own block below.
  // Drivs av FEATURES.useDossierPipeline; opt-in. Tomt → block hoppas över.
  parts.push(
    "## Available Dossiers",
    "",
    `Selected deterministically from the brief's requested capabilities (pool size: ${dossierSel.poolSize}). Each dossier maps to one capability the site needs.`,
    "",
  );
  for (const sel of dossierSel.selected) {
    const e = sel.entry;
    const configBadge = e.class === "hard"
      ? sel.configured
        ? " [configured]"
        : " [UNCONFIGURED — render placeholder UI]"
      : "";
    parts.push(
      `- **${e.label}** \`${e.id}\` (${e.class}, capability: ${e.capability}, ${e.codeFidelity})${configBadge}`,
    );
    parts.push(`  - ${e.summary}`);
  }
  parts.push("");

  const withInstructions = dossierSel.selected.filter((s) => s.entry.instructions);
  if (withInstructions.length > 0) {
    parts.push(
      "## Selected Dossier Instructions",
      "",
      "Compact runtime instructions for each selected dossier. Adapt to the user's request — do not paste blindly.",
      "",
      "For dossier files whose `codeFidelity` is **rewritable**: you MAY adapt these files, but you MUST preserve all `export` statements (named + default) listed in the dossier's `exposes`. Failure to export an exposed name will cause cross-file-import-checker to log a `dossier_exposed_path` warning.",
      "",
    );
    for (const sel of withInstructions) {
      if (shouldUseFullInstructions(sel, opts)) {
        parts.push(`### ${sel.entry.label} (\`${sel.entry.id}\`)`, "");
        parts.push(sel.entry.instructions!.trim(), "");
      } else {
        parts.push(...renderCompactDossierInstructions(sel));
      }
    }
  }

  // ── Verbatim files (Fas 1.5: dossier-as-code) ─────────────────────────
  // Files marked `injectionMode: "verbatim"` (or defaulting to it for
  // integration api-routes/middleware/config/util) MUST be emitted by the
  // codegen LLM exactly as given. This protects integration glue (Stripe
  // webhook signing, auth middleware, SDK init) from accidental rewrites.
  const verbatimFiles: VerbatimFile[] = [];
  for (const sel of dossierSel.selected) {
    const files = sel.entry.files ?? [];
    for (const file of files) {
      const mode = defaultInjectionMode(file, sel.entry);
      if (mode !== "verbatim") continue;
      const content = getDossierFileContent(sel.entry.class, sel.entry.id, file.path);
      if (content === null) {
        throw new Error(
          `[dossiers] verbatim-missing ${sel.entry.id}: file '${file.path}' was requested verbatim but cannot be read from data/dossiers/${sel.entry.class}/${sel.entry.id}/`,
        );
      }
      // Dossier files live under data/dossiers/<id>/components/<path-in-project>.
      // `mapDossierPathToOutput` translates the staging path to the path the
      // user project expects (UI components keep `components/`, API routes
      // move to `app/api/`, middleware/instrumentation/sentry-config land at
      // root). See `dossiers/output-path.ts` for the rotorsaks-historik.
      const outputPath = mapDossierPathToOutput(file.path);
      if (SCAFFOLD_RESERVED_PATHS.has(outputPath)) {
        debugLog(
          "GEN",
          `[verbatim-skip] ${sel.entry.id}: refusing to emit verbatim file at scaffold-reserved path '${outputPath}'`,
        );
        continue;
      }
      const ext = (outputPath.split(".").pop() ?? "ts").toLowerCase();
      const fence =
        ext === "tsx" || ext === "ts" || ext === "js" || ext === "jsx" || ext === "css"
          ? ext
          : "text";
      verbatimFiles.push({
        dossierId: sel.entry.id,
        dossierLabel: sel.entry.label,
        relPath: file.path,
        outputPath,
        fence,
        content: content.trimEnd(),
      });
    }
  }
  if (verbatimFiles.length > 0) {
    parts.push(
      "## Dossier Files To Emit Verbatim",
      "",
      "The following files come from selected dossiers and **MUST appear in your CodeProject output exactly as written below**. Do not paraphrase, refactor, rename, or remove any line — these contain integration glue or safety wrappers (auth, webhooks, SDK init, SSR-safe 3D shells) where deviation breaks the integration or runtime safety. Adjust only environment-variable comments if the user already provided a replacement value.",
      "",
      "Files marked **VERBATIM** below MUST be emitted exactly as shown. Any modification will be silently restored to the canonical version on save. If you need to ADAPT behavior, use a separate file or wrap the verbatim component.",
      "",
      "Emit one CodeProject block per file with the exact path shown.",
      "",
    );
    for (const vf of verbatimFiles) {
      parts.push(`### From \`${vf.dossierId}\` (${vf.dossierLabel}) → \`${vf.outputPath}\``);
      parts.push("");
      parts.push("```" + vf.fence + ` file="${vf.outputPath}"`);
      parts.push(vf.content);
      parts.push("```");
      parts.push("");
    }
  }

  return parts;
}

/**
 * Plan 11 / open-question #12: when the follow-up was classified as
 * `capability-modify`, the upstream pipeline suppresses
 * `requestedDossierCapabilities` so the dossier-shell branch goes silent.
 * That alone would leave the LLM with no signal at all about the
 * referenced capability. This block restores the signal in a different
 * shape: it tells the model the user is pointing at an EXISTING on-page
 * element and that the right move is to mutate the existing scene file
 * (already present in the previous-files context) rather than emit a
 * fresh dossier shell on top of it.
 *
 * Rationale (Plan 01 smoke run B / chat `b71dafb3`):
 *
 *   "gör pricken till en kaffekopp som häller kaffe när jag nuddar
 *    den med musen"
 *
 *   - Capability detection fired `visual-3d` from "kaffekopp".
 *   - Without modify-reference detection the prompt was classified as
 *     `capability-add` → `selectDossiersForRequest` re-injected the
 *     `three-fiber-canvas` dossier shell + error-boundary on top of the
 *     working `floating-coffee-overlay.tsx`. The user saw the new shell
 *     render an empty canvas and thought the entire site broke.
 *
 *   - With this block the model gets the capability ids and the
 *     reference tokens that triggered the classification; combined with
 *     the previous-files context already supplied by the generation
 *     pipeline, that is enough for the model to locate the existing
 *     scene file and mutate it.
 */
export function renderCapabilityModifyHintBlock(
  hint: { capabilityIds: string[]; references: string[] } | null | undefined,
): string[] {
  if (!hint) return [];
  const capabilityIds = (hint.capabilityIds ?? []).filter(
    (id) => typeof id === "string" && id.trim().length > 0,
  );
  const references = (hint.references ?? []).filter(
    (ref) => typeof ref === "string" && ref.trim().length > 0,
  );
  if (capabilityIds.length === 0) return [];

  const capabilityList = capabilityIds.map((id) => `\`${id}\``).join(", ");
  const referenceList =
    references.length > 0
      ? references.map((ref) => `\`${ref}\``).join(", ")
      : "(no explicit token captured — the user used a generic deictic such as \"den\")";

  const parts: string[] = [];
  parts.push(
    "## Modify Existing Capability — Do NOT Re-Inject Dossier Shell",
    "",
    `The user is referring to an EXISTING on-page capability output. Detected capabilities: ${capabilityList}. Reference tokens that triggered this classification: ${referenceList}.`,
    "",
    "**What this means for your code output:**",
    "",
    "1. The previous version's files are listed in the file context further down — locate the scene/feature file that implements the referenced capability (e.g. for `visual-3d` look for `floating-*-overlay.tsx`, `*-canvas.tsx`, `*-scene.tsx`, `*-three.tsx`, or whatever component already mounts the dossier on the existing site).",
    "2. **Modify that existing file in place.** Emit it again as a CodeProject block at the same path with your behavioural change applied. Do not invent a new shell file alongside it.",
    "3. Do **not** emit a fresh dossier shell, error-boundary wrapper, or `Suspense` boilerplate — those already exist in the previous version. Re-emitting them would duplicate the mount and the user would see two copies (or a stale shell on top of the working one).",
    "4. Keep the rest of the previously-generated files intact unless the requested change forces a knock-on edit (e.g. updating `app/page.tsx` to pass a new prop).",
    "",
    "If you genuinely cannot find the existing capability file in the previous-files context, fall back to a minimal shell — but say so explicitly in the chat reply so the user knows the prior file was missing.",
    "",
  );
  return parts;
}
