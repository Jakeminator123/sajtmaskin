/**
 * "Beskriv"-discovery eval / dev tool (TS parity with the coach's Python PoC
 * `shadcn_sentence_picker.py`).
 *
 * Runs the Fas 1 discovery chain (`describeComponents`) against a free-text
 * description and prints the ranked, REAL registry candidates. Read-only — it
 * writes nothing to any user site. Useful for eyeballing query generation,
 * search coverage and ranking without the full builder UI.
 *
 * Usage:
 *   npm run shadcn:describe -- "en stapelbar som mäter försäljning"
 *   npm run shadcn:describe -- --limit=5 "a pricing table with three tiers"
 *
 * Notes:
 * - The route flag (`NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE`) does NOT gate this
 *   dev script; it exercises the same library the route uses.
 * - LLM query generation + ranking use existing provider keys when present and
 *   fall back to a deterministic heuristic otherwise (no key required to run).
 */

import { describeComponents } from "@/lib/shadcn/describe";

function parseArgs(argv: string[]): { description: string; limit?: number } {
  let limit: number | undefined;
  const rest: string[] = [];
  for (const arg of argv) {
    const limitMatch = arg.match(/^--limit=(\d+)$/);
    if (limitMatch) {
      limit = Number(limitMatch[1]);
      continue;
    }
    rest.push(arg);
  }
  return { description: rest.join(" ").trim(), limit };
}

async function main(): Promise<void> {
  const { description, limit } = parseArgs(process.argv.slice(2));
  if (!description) {
    console.error(
      'Usage: npm run shadcn:describe -- [--limit=N] "<free-text description>"',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nBeskriv: "${description}"${limit ? ` (limit=${limit})` : ""}\n`);
  const result = await describeComponents({ description, limit });

  console.log(`Queries:            ${result.queries.join(" | ")}`);
  console.log(`Fallback queries:   ${result.usedFallbackQueries ? "yes" : "no"}`);
  console.log(`Ranking:            ${result.ranking}`);
  console.log(`Candidates:         ${result.candidates.length}\n`);

  result.candidates.forEach((candidate, i) => {
    console.log(`${i + 1}. ${candidate.registry}/${candidate.name}`);
    if (candidate.description) console.log(`   ${candidate.description}`);
    if (candidate.registryDependencies?.length) {
      console.log(`   registryDeps: ${candidate.registryDependencies.join(", ")}`);
    }
    if (candidate.dependencies?.length) {
      console.log(`   deps:         ${candidate.dependencies.join(", ")}`);
    }
    if (candidate.reason) console.log(`   why: ${candidate.reason}`);
    console.log(`   add: ${candidate.addCommand}\n`);
  });
}

main().catch((err) => {
  console.error("[shadcn:describe] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
