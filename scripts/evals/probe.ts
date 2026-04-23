/**
 * OMTAG-02 baseline probe: runs the deterministic scaffold-selection layer for
 * a single eval prompt and writes the result as JSON to a file.
 *
 * Called by `scripts/evals/run-baseline.mjs` via `npx tsx`. Kept deliberately
 * small so a repo clone with no API keys still produces a meaningful baseline
 * (scaffoldSelectionMeta, expected-scaffold match, durationMs).
 *
 * Usage: `npx tsx scripts/evals/probe.ts <prompt.json> <output.json>`.
 * Stdout is intentionally allowed to contain library noise — the caller reads
 * the JSON from the output file, not stdout.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { matchScaffoldAuto } from "@/lib/gen/scaffolds/matcher";
import type { BuildIntent } from "@/lib/builder/build-intent";

interface EvalPromptFile {
  id: string;
  prompt: string;
  buildIntent?: BuildIntent;
  expected: {
    scaffold: string;
    variant_any_of?: string[];
    min_routes?: number;
    acceptable_scaffolds?: string[];
  };
}

interface ProbeResult {
  id: string;
  prompt: string;
  buildIntent: BuildIntent;
  expected: EvalPromptFile["expected"];
  phases: {
    scaffold_selection: {
      durationMs: number;
      scaffoldId: string | null;
      match: boolean;
      meta: unknown;
    };
  };
  scaffoldSelectionMeta: unknown;
  expectedMatch: {
    expectedScaffold: string;
    actualScaffold: string | null;
    match: boolean;
    acceptableHit: boolean;
  };
  envSignals: {
    openAiKeyPresent: boolean;
    scaffoldKeywordMatchEnvRaw: string | null;
  };
  probeVersion: number;
  notes: string[];
}

const PROBE_VERSION = 1;

async function main() {
  const [, , promptPathArg, outputPathArg] = process.argv;
  if (!promptPathArg || !outputPathArg) {
    process.stderr.write(
      "[probe] usage: probe.ts <prompt.json> <output.json>\n",
    );
    process.exit(2);
  }

  const promptPath = path.resolve(promptPathArg);
  const outputPath = path.resolve(outputPathArg);
  const raw = await fs.readFile(promptPath, "utf-8");
  const file = JSON.parse(raw) as EvalPromptFile;
  const buildIntent: BuildIntent = file.buildIntent ?? "website";

  const selStart = performance.now();
  const selection = await matchScaffoldAuto(file.prompt, buildIntent, {
    useEmbeddings: true,
  });
  const selDuration = Math.round(performance.now() - selStart);

  const actualScaffold = selection.scaffold?.id ?? null;
  const acceptable = file.expected.acceptable_scaffolds ?? [];
  const exactMatch = actualScaffold === file.expected.scaffold;
  const acceptableHit =
    actualScaffold !== null && acceptable.includes(actualScaffold);

  const openAiKeyPresent = Boolean(
    process.env.OPENAI_API_KEY?.trim() || process.env.OPENAI_KEY?.trim(),
  );

  const notes: string[] = [];
  if (!openAiKeyPresent) {
    notes.push(
      "no OPENAI_API_KEY — embedding similarity skipped, result is keyword-only (selectionMethod reflects this)",
    );
  }
  if (selection.meta.semanticUnavailableReason) {
    notes.push(
      `semantic unavailable: ${selection.meta.semanticUnavailableReason}`,
    );
  }

  const result: ProbeResult = {
    id: file.id,
    prompt: file.prompt,
    buildIntent,
    expected: file.expected,
    phases: {
      scaffold_selection: {
        durationMs: selDuration,
        scaffoldId: actualScaffold,
        match: exactMatch || acceptableHit,
        meta: selection.meta,
      },
    },
    scaffoldSelectionMeta: selection.meta,
    expectedMatch: {
      expectedScaffold: file.expected.scaffold,
      actualScaffold,
      match: exactMatch,
      acceptableHit,
    },
    envSignals: {
      openAiKeyPresent,
      scaffoldKeywordMatchEnvRaw:
        process.env.SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH ?? null,
    },
    probeVersion: PROBE_VERSION,
    notes,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf-8");
  process.stderr.write(
    `[probe] ${file.id} → scaffold=${actualScaffold ?? "null"} match=${
      exactMatch || acceptableHit
    } durationMs=${selDuration}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `[probe] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
