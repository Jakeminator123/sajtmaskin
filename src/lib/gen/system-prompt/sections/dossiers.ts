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

export function renderDossierBlocks(
  dossierSel: DossierSelectionResult | null | undefined,
): string[] {
  if (!dossierSel || dossierSel.selected.length === 0) return [];

  const parts: string[] = [];

  // ── Available Dossiers + Selected Instructions (pool-modellen) ────────
  // Två block:
  //   ## Available Dossiers — kompakt lista av valda legoklossar (LLM ser
  //      vad som finns att stoppa in om prompten begär det)
  //   ## Selected Dossier Instructions — full instructions.md per vald
  //      dossier (When to use / How to integrate / UX rules / Avoid)
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
      "Concrete usage instructions for each selected dossier. Adapt to the user's request — do not paste blindly.",
      "",
    );
    for (const sel of withInstructions) {
      parts.push(`### ${sel.entry.label} (\`${sel.entry.id}\`)`, "");
      parts.push(sel.entry.instructions!.trim(), "");
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
        // The dossier asked for verbatim injection but the file is missing
        // on disk (or path-traversal blocked it). Use console.warn (not
        // debugLog, which is gated on DEBUG=true) — missing integration
        // glue would crash the generated site at runtime, so the operator
        // must see this even in production.
        console.warn(
          `[dossiers] verbatim-missing ${sel.entry.id}: file '${file.path}' was requested verbatim but cannot be read from data/dossiers/${sel.entry.class}/${sel.entry.id}/`,
        );
        continue;
      }
      // Dossier files live under data/dossiers/<id>/components/<path-in-project>
      // The "components/" prefix is the dossier-internal staging dir; strip it
      // for the actual output path so files land at app/.../route.ts etc.
      const outputPath = file.path.replace(/^components\//, "");
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
      "The following files come from selected dossier integrations and **MUST appear in your CodeProject output exactly as written below**. Do not paraphrase, refactor, rename, or remove any line — these contain integration glue (auth, webhooks, SDK init) where deviation breaks the integration. Adjust only environment-variable comments if the user already provided a replacement value.",
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
