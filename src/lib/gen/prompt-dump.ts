import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function readExistingMeta(dir: string): Record<string, unknown> | null {
  const metaPath = join(dir, "meta.json");
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writePromptDumpMeta(
  dir: string,
  payload: Record<string, unknown>,
): void {
  writeFileSync(
    join(dir, "meta.json"),
    JSON.stringify(payload, null, 2) + "\n",
    "utf8",
  );
}

/**
 * Writes files under data/prompt-dumps/<category>/ (overwrites same names each time).
 * When dumping is disabled we still refresh meta.json so dashboards can mark
 * existing `latest.*` artifacts as stale-risk instead of pretending they were
 * refreshed by the current run.
 */
/** Split own-engine full `system` on the standard separator; writes latest codegen dumps. */
export function dumpOwnEngineCodegenFromFullSystem(
  fullSystem: string,
  meta?: Record<string, unknown>,
): void {
  const sepIdx = fullSystem.indexOf(SYSTEM_PROMPT_SEPARATOR);
  const staticCore = sepIdx === -1 ? fullSystem : fullSystem.slice(0, sepIdx);
  const dynamic =
    sepIdx === -1 ? "" : fullSystem.slice(sepIdx + SYSTEM_PROMPT_SEPARATOR.length);
  writeLatestPromptDump(
    PROMPT_DUMP_CATEGORY.ownEngineCodegen,
    {
      "full-system.md": fullSystem,
      "dynamic-context.md": dynamic,
    },
    {
      staticCoreChars: staticCore.length,
      dynamicChars: dynamic.length,
      totalChars: fullSystem.length,
      separatorFound: sepIdx !== -1,
      ...meta,
    },
  );
}

export function writeLatestPromptDump(
  category: PromptDumpCategory,
  files: Record<string, string>,
  meta?: Record<string, unknown>,
): void {
  const dir = PROMPT_DUMP_DIR_BY_CATEGORY[category];
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const dumpingEnabled = isPromptDumpEnabled();
  if (!dumpingEnabled) {
    const existingMeta = readExistingMeta(dir);
    writePromptDumpMeta(dir, {
      category,
      dumpingEnabled: false,
      status: "disabled",
      statusUpdatedAt: now,
      dumpedAt:
        existingMeta && typeof existingMeta.dumpedAt === "string"
          ? existingMeta.dumpedAt
          : null,
      ...meta,
    });
    return;
  }

  const writtenFiles = Object.keys(files).filter(
    (name) => name && !name.includes("..") && !name.includes("/") && !name.includes("\\"),
  );
  for (const [name, content] of Object.entries(files)) {
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) continue;
    writeFileSync(join(dir, name), content, "utf8");
  }
  writePromptDumpMeta(dir, {
    dumpedAt: now,
    statusUpdatedAt: now,
    category,
    dumpingEnabled: true,
    status: "written",
    writtenFiles,
    ...meta,
  });
}
