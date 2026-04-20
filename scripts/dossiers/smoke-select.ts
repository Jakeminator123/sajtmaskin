/**
 * Smoke test: verify dossier selection works end-to-end against real data.
 *
 * Runs a few realistic prompts and prints which dossiers would be injected
 * into the system prompt. Read-only, no side effects.
 *
 * Usage: npx tsx scripts/dossiers/smoke-select.ts
 */

import "dotenv/config";
import { selectDossiersForRequest } from "../../src/lib/gen/dossiers/select";

interface Scenario {
  label: string;
  scaffoldId: string;
  prompt: string;
}

const scenarios: Scenario[] = [
  {
    label: "SaaS with Stripe + Clerk",
    scaffoldId: "saas-landing",
    prompt: "Bygg en SaaS för projektledning med användarinloggning, månadsabonnemang och betalning",
  },
  {
    label: "Ecommerce with Stripe",
    scaffoldId: "ecommerce",
    prompt: "Webshop för handgjorda smycken med kassa, betalning och produktkatalog",
  },
  {
    label: "Blog with Sanity CMS",
    scaffoldId: "blog",
    prompt: "Blogg om matrecept där jag kan publicera nya inlägg via en CMS",
  },
  {
    label: "Dashboard with Postgres",
    scaffoldId: "dashboard",
    prompt: "Admin-dashboard med användardata, statistik och databas",
  },
  {
    label: "AI chat app",
    scaffoldId: "app-shell",
    prompt: "Chatt-app med GPT-integration och tool-calling för att boka tider",
  },
];

async function main() {
  console.log("\n=== Dossier Selection Smoke Test ===\n");

  for (const sc of scenarios) {
    console.log(`\n--- ${sc.label} (${sc.scaffoldId}) ---`);
    console.log(`prompt: "${sc.prompt}"`);

    const result = await selectDossiersForRequest({
      scaffoldId: sc.scaffoldId,
      prompt: sc.prompt,
      maxTotal: 4,
    });

    console.log(`  pool=${result.poolSize}  embeddings=${result.embeddingsUsed ? "yes" : "no (recommendation-only fallback)"}`);
    if (result.selected.length === 0) {
      console.log("  → no dossiers selected");
      continue;
    }
    for (const d of result.selected) {
      const score = d.score.toFixed(3);
      console.log(`  → ${d.entry.id}  (score=${score}, reason=${d.reason})`);
    }
  }
  console.log("\n=== End ===\n");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
