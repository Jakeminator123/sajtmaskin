/**
 * Promote selected skiss-files (data/dossiers/_raw/<id>/skiss.json) into
 * draft dossier folders (data/dossiers/<id>/manifest.json + instructions.md).
 *
 * Reads:
 *   scripts/dossiers/curated-promotions.txt  — list of skiss-ids to promote
 *   data/dossiers/_raw/<id>/skiss.json       — scraped metadata
 * Writes:
 *   data/dossiers/<id>/manifest.json         — draft manifest, _status: "draft"
 *   data/dossiers/<id>/instructions.md       — instructions skeleton
 *
 * Drafts are valid manifest.json structurally but marked _status: "draft" so
 * they are excluded from runtime injection. To go live, a human must:
 *   1. Add the components/* files (clone repo or write by hand)
 *   2. Fill in the .env.example if envVars are needed
 *   3. Flesh out instructions.md (When to use / How to integrate / UX rules / Avoid / Verification)
 *   4. Change _status from "draft" to "active"
 *   5. Run `npm run dossiers:rebuild`
 *
 * The script never writes into existing dossier folders that already have a
 * manifest.json with _status != "draft" — won't overwrite hand-curated work.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const WORKSPACE_ROOT = process.cwd();
const RAW_ROOT = resolve(WORKSPACE_ROOT, "data", "dossiers", "_raw");
const DOSSIER_ROOT = resolve(WORKSPACE_ROOT, "data", "dossiers");
const PROMOTIONS_PATH = resolve(WORKSPACE_ROOT, "scripts", "dossiers", "curated-promotions.txt");

interface DossierSkiss {
  id: string;
  category: string;
  _kindHint: "integration" | "ui-section";
  title: string;
  description: string;
  templateUrl: string;
  templateSlug: string;
  repoUrl: string | null;
  demoUrl: string | null;
}

interface DraftManifest {
  $schema: string;
  id: string;
  kind: "integration" | "ui-section";
  category: string;
  label: string;
  description: string;
  summary: string;
  providers?: Array<{ name: string; url?: string }>;
  envVars: Array<{ key: string; required: boolean; purpose: string }>;
  dependencies: string[];
  files: Array<{ path: string; role: string; kind: string }>;
  exposes?: Array<{ name: string; type: string; import: string }>;
  scaffoldFit: { primary: string[]; compatible: string[] };
  complexity: "simple" | "medium" | "advanced";
  qualityScore?: number;
  sourceTemplateUrl?: string;
  sourceRepoUrl?: string;
  lastVerified: string;
  tags: string[];
  _source: string;
  _status: "draft" | "active";
}

function readPromotionsList(): string[] {
  if (!existsSync(PROMOTIONS_PATH)) {
    console.error(`Missing ${PROMOTIONS_PATH}`);
    process.exit(1);
  }
  // Strip JS-style /* ... */ block comments first, then per-line # comments.
  const raw = readFileSync(PROMOTIONS_PATH, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return raw
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("#");
      return (idx === -1 ? line : line.slice(0, idx)).trim();
    })
    .filter((line) => line && /^[a-z0-9][-a-z0-9]*$/.test(line));
}

function loadSkiss(id: string): DossierSkiss | null {
  const path = join(RAW_ROOT, id, "skiss.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as DossierSkiss;
  } catch {
    return null;
  }
}

/** Map our category → typical scaffoldFit defaults (overridable in draft). */
const SCAFFOLD_FIT_DEFAULTS: Record<string, { primary: string[]; compatible: string[] }> = {
  auth: {
    primary: ["auth-pages", "app-shell", "dashboard"],
    compatible: ["saas-landing", "ecommerce", "landing-page", "content-site", "blog", "portfolio", "base-nextjs"],
  },
  payments: {
    primary: ["ecommerce", "saas-landing"],
    compatible: ["landing-page", "content-site", "blog", "portfolio", "app-shell", "dashboard", "auth-pages", "base-nextjs"],
  },
  database: {
    primary: ["app-shell", "dashboard", "ecommerce", "saas-landing"],
    compatible: ["blog", "content-site", "auth-pages", "landing-page", "portfolio", "base-nextjs"],
  },
  cms: {
    primary: ["blog", "content-site", "portfolio"],
    compatible: ["landing-page", "saas-landing", "ecommerce", "app-shell", "dashboard", "auth-pages", "base-nextjs"],
  },
  realtime: {
    primary: ["app-shell", "dashboard"],
    compatible: ["saas-landing", "ecommerce", "blog", "content-site", "portfolio", "auth-pages", "landing-page", "base-nextjs"],
  },
  bookings: {
    primary: ["landing-page", "content-site", "saas-landing"],
    compatible: ["portfolio", "blog", "app-shell", "dashboard", "ecommerce", "auth-pages", "base-nextjs"],
  },
  email: {
    primary: ["landing-page", "saas-landing", "content-site"],
    compatible: ["ecommerce", "blog", "portfolio", "app-shell", "dashboard", "auth-pages", "base-nextjs"],
  },
  analytics: {
    primary: ["dashboard", "app-shell", "saas-landing"],
    compatible: ["ecommerce", "blog", "content-site", "portfolio", "landing-page", "auth-pages", "base-nextjs"],
  },
  ai: {
    primary: ["app-shell", "dashboard", "saas-landing"],
    compatible: ["landing-page", "content-site", "blog", "portfolio", "ecommerce", "auth-pages", "base-nextjs"],
  },
  storage: {
    primary: ["ecommerce", "portfolio", "blog", "content-site"],
    compatible: ["saas-landing", "landing-page", "app-shell", "dashboard", "auth-pages", "base-nextjs"],
  },
  search: {
    primary: ["ecommerce", "blog", "content-site", "saas-landing"],
    compatible: ["dashboard", "app-shell", "portfolio", "landing-page", "auth-pages", "base-nextjs"],
  },
  "ui-marketing": {
    primary: ["landing-page", "saas-landing", "content-site"],
    compatible: ["portfolio", "blog", "ecommerce", "app-shell", "dashboard", "auth-pages", "base-nextjs"],
  },
  "ui-content": {
    primary: ["blog", "content-site", "portfolio"],
    compatible: ["landing-page", "saas-landing", "app-shell", "dashboard", "ecommerce", "auth-pages", "base-nextjs"],
  },
  "ui-data": {
    primary: ["dashboard", "app-shell"],
    compatible: ["saas-landing", "ecommerce", "blog", "content-site", "portfolio", "landing-page", "auth-pages", "base-nextjs"],
  },
};

function buildDraftManifest(skiss: DossierSkiss): DraftManifest {
  const fit = SCAFFOLD_FIT_DEFAULTS[skiss.category] ?? {
    primary: [],
    compatible: ["base-nextjs"],
  };

  return {
    $schema: "../../../docs/schemas/strict/dossier.schema.json",
    id: skiss.id,
    kind: skiss._kindHint,
    category: skiss.category,
    label: skiss.title,
    description: skiss.description || skiss.title,
    summary: `${skiss.description || skiss.title}\n\nDraft generated from Vercel template ${skiss.templateUrl}. Curator must replace this summary with concrete usage description (when to use, what it provides) before promoting to active.`,
    providers: skiss.repoUrl ? [{ name: "TBD", url: skiss.repoUrl }] : [],
    envVars: [],
    dependencies: [],
    files: [],
    scaffoldFit: fit,
    complexity: "medium",
    qualityScore: 80,
    sourceTemplateUrl: skiss.templateUrl,
    sourceRepoUrl: skiss.repoUrl ?? undefined,
    lastVerified: new Date().toISOString().slice(0, 10),
    tags: [skiss.category, skiss._kindHint, ...(skiss.templateSlug.split(/[-_]/).filter(Boolean).slice(0, 4))],
    _source: "vercel-light-catalog",
    _status: "draft",
  };
}

function buildDraftInstructions(skiss: DossierSkiss): string {
  return `# When to use

_Curator: replace this with 1-3 specific bullets describing when the LLM should use this dossier._

- _Example: User mentions ${skiss.category} provider X, Y, or Z._
- _Example: User has chosen [Provider] explicitly._

# How to integrate

_Curator: write concrete steps. Reference actual files in \`components/\`._

1. Install dependencies (see manifest.json \`dependencies\`).
2. Copy \`components/\` files into the user's project.
3. Add env vars from \`.env.example\` to user's \`.env.local\`.
4. _Steps specific to this provider..._

# UX rules

- _Loading states, error feedback, accessibility..._

# Avoid

- _Concrete anti-patterns specific to this integration..._

# Verification

- _Manual check-points the user can test in preview..._

---

**Source template:** ${skiss.templateUrl}
${skiss.repoUrl ? `**Repo:** ${skiss.repoUrl}\n` : ""}${skiss.demoUrl ? `**Demo:** ${skiss.demoUrl}\n` : ""}
**Status:** draft. Fill in concrete content above + add \`components/*.tsx\` + \`.env.example\` if needed, then change \`_status\` to "active" in manifest.json.
`;
}

function shouldOverwrite(existingManifestPath: string): boolean {
  if (!existsSync(existingManifestPath)) return true;
  try {
    const existing = JSON.parse(readFileSync(existingManifestPath, "utf-8")) as { _status?: string };
    return existing._status === "draft"; // only overwrite drafts, never active
  } catch {
    return false; // unparseable — leave alone
  }
}

function main(): void {
  const ids = readPromotionsList();
  console.log(`[promote] ${ids.length} ids to promote`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const id of ids) {
    const skiss = loadSkiss(id);
    if (!skiss) {
      console.warn(`[promote] MISSING skiss: ${id}`);
      missing++;
      continue;
    }
    const dossierDir = join(DOSSIER_ROOT, id);
    const manifestPath = join(dossierDir, "manifest.json");
    const instructionsPath = join(dossierDir, "instructions.md");

    if (!shouldOverwrite(manifestPath)) {
      console.log(`[promote] SKIP (not a draft): ${id}`);
      skipped++;
      continue;
    }

    const isUpdate = existsSync(manifestPath);
    mkdirSync(dossierDir, { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(buildDraftManifest(skiss), null, 2) + "\n", "utf-8");
    if (!existsSync(instructionsPath)) {
      writeFileSync(instructionsPath, buildDraftInstructions(skiss), "utf-8");
    }
    if (isUpdate) updated++;
    else created++;
  }

  console.log(`[promote] Done: ${created} created, ${updated} updated, ${skipped} skipped, ${missing} missing`);
  console.log(`[promote] Next: review drafts in data/dossiers/, then run npm run dossiers:rebuild`);
}

main();
