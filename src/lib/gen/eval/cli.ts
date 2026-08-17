import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canonicalExitCode,
  parseCanonicalEvalArgs,
  runCanonicalEval,
  toCanonicalJson,
} from "./canonical";

function loadDotEnvLocal(): void {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [rawKey, ...valueParts] = line.split("=");
    const key = rawKey.trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const args = parseCanonicalEvalArgs(process.argv.slice(2));
  const print = args.json
    ? (line: string) => console.error(line)
    : (line: string) => console.log(line);

  if (args.mode === "free") {
    print("Canonical eval (free lanes only — no OPENAI_API_KEY, no POSTGRES_URL).");
  } else {
    print(
      `Canonical eval (${args.mode}). Free lanes first, then paid codegen.`,
    );
  }

  const { result } = await runCanonicalEval({
    mode: args.mode,
    dumpMode: args.dumpMode,
    force: args.force,
    promptIds: args.promptIds,
    print,
  });

  const json = toCanonicalJson(result);
  if (args.json) {
    console.log(JSON.stringify(json, null, 2));
  } else {
    const codegenLabel = [
      result.lanes.codegen.outcome.toUpperCase(),
      result.lanes.codegen.skipReason,
      result.lanes.codegen.forced ? "forced" : null,
    ]
      .filter(Boolean)
      .join(" ");
    print(
      `Eval outcome: ${result.outcome.toUpperCase()} (exit ${canonicalExitCode(result.outcome)})` +
        ` — followup ${result.lanes.followup.outcome.toUpperCase()},` +
        ` scaffold ${result.lanes.scaffold.outcome.toUpperCase()},` +
        ` codegen ${codegenLabel}`,
    );
  }

  process.exitCode = canonicalExitCode(result.outcome);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
