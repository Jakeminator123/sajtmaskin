#!/usr/bin/env node

/**
 * Reads scaffold candidates JSON (produced by vercel_template_cli.py --candidates)
 * and produces a curated reference list suitable for sync-scaffold-refs.mjs.
 *
 * Usage:
 *   node scripts/curate-scaffold-candidates.mjs scaffold-candidates.json
 *
 * Outputs:
 *   data/scaffold-candidates-curated.json  (filtered, scored, ready for review)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const RELEVANCE_KEYWORDS = {
  high: [
    "restaurant", "booking", "reservation", "clinic", "salon", "event",
    "conference", "wedding", "nonprofit", "charity", "association",
    "ecommerce", "shop", "store", "saas", "portfolio", "blog",
  ],
  medium: [
    "documentation", "docs", "landing", "marketing", "starter",
    "dashboard", "admin", "cms", "authentication",
  ],
  low: [
    "web3", "blockchain", "monorepo", "microfrontend", "edge-config",
    "experimentation", "flags", "cdn",
  ],
};

function scoreCandidate(candidate) {
  const text = `${candidate.slug} ${candidate.name} ${candidate.description}`.toLowerCase();

  for (const kw of RELEVANCE_KEYWORDS.high) {
    if (text.includes(kw)) return { score: 3, tier: "high" };
  }
  for (const kw of RELEVANCE_KEYWORDS.medium) {
    if (text.includes(kw)) return { score: 2, tier: "medium" };
  }
  for (const kw of RELEVANCE_KEYWORDS.low) {
    if (text.includes(kw)) return { score: 0, tier: "low" };
  }
  return { score: 1, tier: "unknown" };
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/curate-scaffold-candidates.mjs <candidates.json>");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(resolve(inputPath), "utf-8"));
  const candidates = raw.candidates || [];

  if (candidates.length === 0) {
    console.log("No candidates found in input file.");
    return;
  }

  const scored = candidates.map((c) => {
    const { score, tier } = scoreCandidate(c);
    return { ...c, relevance_score: score, relevance_tier: tier };
  });

  scored.sort((a, b) => b.relevance_score - a.relevance_score);

  const high = scored.filter((c) => c.relevance_tier === "high");
  const medium = scored.filter((c) => c.relevance_tier === "medium");
  const ignored = scored.filter((c) => c.relevance_tier === "low");

  const output = {
    _meta: {
      generated: new Date().toISOString(),
      source: "curate-scaffold-candidates.mjs",
      input: inputPath,
      total: scored.length,
      high: high.length,
      medium: medium.length,
      ignored: ignored.length,
    },
    high_priority: high,
    medium_priority: medium,
    low_priority_ignored: ignored.map((c) => ({
      name: c.name,
      slug: c.slug,
      reason: "Low relevance for sajtmaskin scaffolds",
    })),
  };

  const outDir = resolve("data");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "scaffold-candidates-curated.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

  console.log(`Curated ${scored.length} candidates:`);
  console.log(`  High priority: ${high.length}`);
  console.log(`  Medium:        ${medium.length}`);
  console.log(`  Ignored:       ${ignored.length}`);
  console.log(`Output: ${outPath}`);
}

main();
