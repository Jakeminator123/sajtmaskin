import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { SYSTEM_PROMPT_SEPARATOR } from "./system-prompt";

const ROOT_DIR = join(process.cwd(), "data", "prompt-dumps");

/** Subfolders under data/prompt-dumps/ — one logical “prompt type” each. */
export const PROMPT_DUMP_CATEGORY = {
  /** Output of buildDynamicContext (the dynamic portion of the system prompt). */
  orchestrationDynamic: "orchestration-dynamic",
  /** Full system string sent to the codegen LLM (static + separator + dynamic). */
  ownEngineCodegen: "own-engine-codegen",
  /** Planner: preamble, dynamic enrichment, and combined system actually sent. */
  planModePlanner: "plan-mode-planner",
} as const;

export type PromptDumpCategory =
  (typeof PROMPT_DUMP_CATEGORY)[keyof typeof PROMPT_DUMP_CATEGORY];

const PROMPT_DUMP_DIR_BY_CATEGORY: Record<PromptDumpCategory, string> = {
  [PROMPT_DUMP_CATEGORY.orchestrationDynamic]: join(ROOT_DIR, PROMPT_DUMP_CATEGORY.orchestrationDynamic),
  [PROMPT_DUMP_CATEGORY.ownEngineCodegen]: join(ROOT_DIR, PROMPT_DUMP_CATEGORY.ownEngineCodegen),
  [PROMPT_DUMP_CATEGORY.planModePlanner]: join(ROOT_DIR, PROMPT_DUMP_CATEGORY.planModePlanner),
};

function isPromptDumpEnabled(): boolean {
  const v = process.env.SAJTMASKIN_PROMPT_DUMP?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Writes files under data/prompt-dumps/<category>/ (overwrites same names each time).
 * No-op unless SAJTMASKIN_PROMPT_DUMP=1 (or true/yes).
 */
/** Split own-engine full `system` on the standard separator; writes latest codegen dumps. */
export function dumpOwnEngineCodegenFromFullSystem(
  fullSystem: string,
  meta?: Record<string, unknown>,
): void {
  const sepIdx = fullSystem.indexOf(SYSTEM_PROMPT_SEPARATOR);
  const dynamic =
    sepIdx === -1 ? "" : fullSystem.slice(sepIdx + SYSTEM_PROMPT_SEPARATOR.length);
  writeLatestPromptDump(
    PROMPT_DUMP_CATEGORY.ownEngineCodegen,
    {
      "full-system.md": fullSystem,
      "dynamic-context.md": dynamic,
    },
    meta,
  );
}

export function writeLatestPromptDump(
  category: PromptDumpCategory,
  files: Record<string, string>,
  meta?: Record<string, unknown>,
): void {
  if (!isPromptDumpEnabled()) return;
  const dir = PROMPT_DUMP_DIR_BY_CATEGORY[category];
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) continue;
    writeFileSync(join(dir, name), content, "utf8");
  }
  writeFileSync(
    join(dir, "meta.json"),
    JSON.stringify(
      {
        dumpedAt: new Date().toISOString(),
        category,
        ...meta,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}
