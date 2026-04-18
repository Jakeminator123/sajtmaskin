/**
 * Smoke-test for the Fas 1.0 + 1.5 LLM-flow: brief nominations, dossier
 * selection, drift-detection, and verbatim file injection.
 *
 * Builds a real dynamic system prompt for a synthetic "saas with stripe + clerk"
 * request and prints WHICH dossiers were selected + WHICH files would be
 * emitted verbatim by the codegen LLM.
 *
 * Does NOT call any external LLM — pure deterministic check that the wiring
 * works end-to-end with the data on disk.
 *
 * Usage:
 *   npm run dossiers:smoke-prompt
 *   npm run dossiers:smoke-prompt -- --prompt="hardrock store with merch + login"
 *   npm run dossiers:smoke-prompt -- --scaffold=ecommerce
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(process.cwd(), ".env.local") });

import { selectDossiersForRequest } from "../../src/lib/gen/dossiers";
import { buildDynamicContext, type Brief } from "../../src/lib/gen/system-prompt";
import { getScaffoldById } from "../../src/lib/gen/scaffolds";
import type { BuildSpec } from "../../src/lib/gen/build-spec";

interface CliArgs {
  prompt: string;
  scaffoldId: string;
  brief: Brief;
}

/**
 * Pre-defined preset briefs to avoid the trap where a hardcoded SaaS+Stripe
 * brief drowns out the actual prompt signal in the embedding query.
 */
const PRESETS: Record<string, { prompt: string; scaffoldId: string; brief: Brief }> = {
  saas: {
    prompt:
      "Build a SaaS landing page for an analytics product. " +
      "Stripe subscription billing, Clerk login, postgres for accounts.",
    scaffoldId: "saas-landing",
    brief: {
      projectTitle: "Smoke Test SaaS",
      oneSentencePitch: "Track product analytics and convert visitors with subscription billing.",
      targetAudience: "B2B product teams",
      primaryCallToAction: "Start free trial",
      toneAndVoice: ["confident", "data-driven"],
      pages: [
        { name: "Home", path: "/", purpose: "marketing landing with pricing", sections: [] },
        { name: "Login", path: "/login", purpose: "user authentication entry", sections: [] },
        { name: "Pricing", path: "/pricing", purpose: "show subscription plans + Stripe checkout", sections: [] },
      ],
      mustHave: ["stripe subscription checkout", "clerk login", "pricing page"],
      uiNotes: { components: ["pricing table", "auth form", "checkout button"] },
      domainProfile: "saas-analytics-product",
      qualityBar: "premium",
      motionLevel: "moderate",
    },
  },
  blog: {
    prompt: "Build a personal tech blog for a senior engineer with markdown posts and tags.",
    scaffoldId: "blog",
    brief: {
      projectTitle: "Smoke Test Blog",
      oneSentencePitch: "Personal long-form blog for engineering deep-dives.",
      targetAudience: "Other developers and tech leads",
      primaryCallToAction: "Subscribe",
      toneAndVoice: ["thoughtful", "minimal"],
      pages: [
        { name: "Home", path: "/", purpose: "post index with categories", sections: [] },
        { name: "Post", path: "/blog/[slug]", purpose: "single article view", sections: [] },
        { name: "About", path: "/about", purpose: "author bio and contact", sections: [] },
      ],
      mustHave: ["blog post list", "tag filter", "rss feed"],
      uiNotes: { components: ["post card", "tag chip", "reading progress"] },
      domainProfile: "personal-tech-blog",
      qualityBar: "clean",
      motionLevel: "minimal",
    },
  },
  "blog-3d-followup": {
    prompt:
      "Lägg till en 3D-figur som flyger ovanför blogginläggen, gärna en abstrakt geometrisk form med mjuk hovring",
    scaffoldId: "blog",
    brief: {
      projectTitle: "Smoke Test Blog + 3D",
      oneSentencePitch: "Personal blog with a floating 3D hero element.",
      targetAudience: "Other developers and tech leads",
      primaryCallToAction: "Read latest",
      toneAndVoice: ["modern", "playful"],
      pages: [
        { name: "Home", path: "/", purpose: "blog index with floating 3D hero above posts", sections: [] },
        { name: "Post", path: "/blog/[slug]", purpose: "single article", sections: [] },
      ],
      mustHave: ["blog post list", "floating 3d hero", "smooth animation"],
      uiNotes: { components: ["3d scene", "floating mesh", "post card"] },
      domainProfile: "personal-tech-blog-with-3d",
      qualityBar: "premium",
      motionLevel: "lively",
    },
  },
  ecommerce: {
    prompt: "Stora online-butik för death-metal-merch med snabb checkout och produktbilder",
    scaffoldId: "ecommerce",
    brief: {
      projectTitle: "Smoke Test Death Metal Merch",
      oneSentencePitch: "Online merch store for a death metal label.",
      targetAudience: "Hard rock and metal fans",
      primaryCallToAction: "Shop now",
      toneAndVoice: ["bold", "dark"],
      pages: [
        { name: "Home", path: "/", purpose: "merch storefront with featured products", sections: [] },
        { name: "Product", path: "/product/[id]", purpose: "single product page", sections: [] },
        { name: "Checkout", path: "/checkout", purpose: "cart and payment", sections: [] },
      ],
      mustHave: ["product grid", "cart", "stripe checkout"],
      uiNotes: { components: ["product card", "cart drawer", "checkout form"] },
      domainProfile: "death-metal-merch-store",
      qualityBar: "bold-dramatic",
      motionLevel: "moderate",
    },
  },
};

function parseCli(): CliArgs {
  const argv = process.argv.slice(2);
  let presetName = "saas";
  let promptOverride: string | null = null;
  let scaffoldOverride: string | null = null;
  for (const a of argv) {
    if (a === "--list-presets" || a === "--help" || a === "-h") {
      console.log("Available presets:");
      for (const [name, p] of Object.entries(PRESETS)) {
        console.log(`  ${name.padEnd(22)} scaffold=${p.scaffoldId.padEnd(14)} prompt="${p.prompt.slice(0, 60)}..."`);
      }
      console.log("");
      console.log("Usage:");
      console.log("  npm run dossiers:smoke-prompt                              # default preset (saas)");
      console.log("  npm run dossiers:smoke-prompt -- --preset=blog");
      console.log("  npm run dossiers:smoke-prompt -- --preset=blog --prompt=\"...\"");
      console.log("  npm run dossiers:smoke-prompt -- --preset=blog --scaffold=blog");
      process.exit(0);
    }
    if (a.startsWith("--preset=")) presetName = a.slice("--preset=".length);
    else if (a.startsWith("--prompt=")) promptOverride = a.slice("--prompt=".length);
    else if (a.startsWith("--scaffold=")) scaffoldOverride = a.slice("--scaffold=".length);
  }
  const preset = PRESETS[presetName];
  if (!preset) {
    console.error(`[smoke-prompt] Unknown preset: ${presetName}. Available: ${Object.keys(PRESETS).join(", ")}`);
    console.error(`[smoke-prompt] Run with --list-presets for details.`);
    process.exit(1);
  }
  return {
    prompt: promptOverride ?? preset.prompt,
    scaffoldId: scaffoldOverride ?? preset.scaffoldId,
    brief: preset.brief,
  };
}

const TINY_BUILD_SPEC: BuildSpec = {
  buildIntent: "website",
  generationMode: "init",
  changeScope: "redesign",
  scaffoldId: "saas-landing",
  routePlanSummary: "smoke-test:/",
  stylePack: "default",
  qualityTarget: "standard",
  previewPolicy: "fidelity2",
  verificationPolicy: "standard",
  contextPolicy: "normal",
  referenceCategories: [],
  forbiddenPatterns: [],
  tokenBudgets: {
    scaffoldChars: 36_000,
    refsChars: 12_000,
    systemContextChars: 96_000,
    systemContextTokens: 30_000,
  },
};

async function main(): Promise<void> {
  const { prompt, scaffoldId, brief } = parseCli();

  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`SMOKE PROMPT — fas 1 LLM-flöde end-to-end (no LLM calls)`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`prompt:     "${prompt}"`);
  console.log(`scaffoldId: ${scaffoldId}`);
  console.log(`brief.mustHave: ${brief.mustHave?.join(" | ")}`);
  console.log(`brief.pages:    ${brief.pages?.map((p) => p.path).join(" ")}`);
  console.log(``);

  // 1. Run dossier selection (mirrors orchestrate.ts)
  const scaffold = getScaffoldById(scaffoldId);
  const scaffoldContext = scaffold
    ? `Scaffold ${scaffold.label}. Tags: ${scaffold.tags.join(", ")}.`
    : undefined;
  const routePlanSummary = brief.pages
    ? `routes: ${brief.pages.map((p) => `${p.path} (${p.purpose})`).join(" | ")}`
    : undefined;

  const selection = await selectDossiersForRequest({
    prompt,
    brief: brief as Record<string, unknown>,
    scaffoldId,
    scaffoldContext,
    routePlanSummary,
  });

  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`DOSSIER SELECTION`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`Pool: ${selection.poolSize} active dossiers`);
  console.log(`Embeddings used: ${selection.embeddingsUsed}`);
  console.log(`Selected: ${selection.selected.length}`);
  for (const s of selection.selected) {
    const fileCount = s.entry.files.length;
    console.log(
      `  - ${s.entry.id.padEnd(50)} score=${s.score.toFixed(3)} reason=${s.reason} files=${fileCount}`,
    );
  }
  console.log(``);

  // 2. Build the dynamic context (this is what reaches the codegen LLM)
  const result = await buildDynamicContext({
    intent: "website",
    generationMode: "init",
    brief,
    buildSpec: { ...TINY_BUILD_SPEC, scaffoldId: scaffoldId as typeof TINY_BUILD_SPEC.scaffoldId },
    scaffoldContext,
    resolvedScaffold: scaffold,
    dossierSelection: selection,
    userPrompt: prompt,
  });

  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`DYNAMIC CONTEXT BLOCKS (truncated headers + sizes)`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  const blocks = result.context.split(/\n(?=## )/);
  for (const b of blocks) {
    const firstLine = b.split("\n", 1)[0]!.slice(0, 70);
    const sizeKB = (b.length / 1024).toFixed(1);
    console.log(`  ${sizeKB.padStart(6)} KB  ${firstLine}`);
  }
  console.log(`  ───────`);
  console.log(`  ${(result.context.length / 1024).toFixed(1).padStart(6)} KB  TOTAL dynamic context`);
  console.log(``);

  // 3. Verbatim files check
  const verbatimMatches = result.context.match(/```\w+ file="([^"]+)"/g) ?? [];
  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`VERBATIM FILES TO EMIT`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  if (verbatimMatches.length === 0) {
    console.log(`(none — selected dossiers had no verbatim-tagged files OR file content unreadable)`);
  } else {
    for (const m of verbatimMatches) {
      console.log(`  ${m}`);
    }
  }
  console.log(``);

  // 4. Pruning check (did anything get cut?)
  if (result.pruning && result.pruning.droppedBlockKeys.length > 0) {
    console.log(`══════════════════════════════════════════════════════════════════`);
    console.log(`PRUNING (blocks dropped due to token budget)`);
    console.log(`══════════════════════════════════════════════════════════════════`);
    console.log(`  budget: ${result.pruning.budgetTokens} tokens, used: ${result.pruning.usedTokens}`);
    for (const key of result.pruning.droppedBlockKeys) {
      console.log(`  - dropped: ${key}`);
    }
    console.log(``);
  }

  console.log(`✓ Smoke prompt OK — ${result.context.length} chars in dynamic context`);
}

main().catch((e) => {
  console.error("[smoke-prompt] Failed:", e);
  process.exit(1);
});
