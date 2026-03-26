/**
 * Merge `.env.local` for Vercel Sandbox preview (K-018 / K18-1):
 * 1) global integration placeholders from `config/ai_models/*-placeholders.env.txt`
 * 2) per-app-project preview tokens (stable fake secrets from project id)
 * 3) decrypted `projectEnvVars` from app project meta (user-configured)
 * 4) any `.env.local` emitted by the model (wins on key collision)
 */

import {
  parseGeneratedSitePlaceholderLines,
  readGeneratedSitePlaceholdersEnvText,
} from "@/lib/ai-models/load-generated-site-placeholders";
import { getStoredProjectEnvVarMap } from "@/lib/project-env-vars";
import { buildProjectPreviewPlaceholderRecord } from "@/lib/gen/sandbox-project-preview-env";

const FILE_HEADER = `# Sajtmaskin sandbox preview — merged env (global → project preview → user project → generated)
# Do not use in production; values are for preview only unless you set them in the project.
`;

function parseDotenvBody(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    let t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (/^export\s+/i.test(t)) t = t.replace(/^export\s+/i, "").trim();
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function quoteEnvValue(val: string): string {
  if (val === "") return '""';
  if (/[\s#"'\\]/.test(val) || val.includes("\n")) {
    return `"${val
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")}"`;
  }
  return val;
}

function formatDotenvBody(vars: Record<string, string>): string {
  const keys = Object.keys(vars).sort((a, b) => a.localeCompare(b));
  return keys.map((k) => `${k}=${quoteEnvValue(vars[k] ?? "")}`).join("\n");
}

function loadPlaceholderRecord(): Record<string, string> {
  try {
    const text = readGeneratedSitePlaceholdersEnvText();
    return Object.fromEntries(
      parseGeneratedSitePlaceholderLines(text).map((x) => [x.key, x.value]),
    );
  } catch (err) {
    console.warn(
      "[sandbox-env-local] Integration placeholders not loaded:",
      err instanceof Error ? err.message : err,
    );
    return {};
  }
}

/** Pure merge for tests — later records override earlier keys. */
export function mergeSandboxEnvRecords(
  placeholders: Record<string, string>,
  project: Record<string, string>,
  generated: Record<string, string>,
): Record<string, string> {
  return { ...placeholders, ...project, ...generated };
}

/**
 * Build full `.env.local` body for sandbox: placeholders + optional project vars + optional generated overlay.
 */
export async function buildSandboxEnvLocalContents(params: {
  appProjectId?: string | null;
  /** Raw `.env.local` from generated files, if any. */
  generatedEnvLocal?: string | null;
}): Promise<string> {
  const placeholders = loadPlaceholderRecord();
  let project: Record<string, string> = {};
  const pid = typeof params.appProjectId === "string" ? params.appProjectId.trim() : "";
  if (pid) {
    try {
      project = await getStoredProjectEnvVarMap(pid);
    } catch (err) {
      console.warn(
        "[sandbox-env-local] Failed to load project env vars:",
        err instanceof Error ? err.message : err,
      );
    }
  }
  const generated = params.generatedEnvLocal?.trim()
    ? parseDotenvBody(params.generatedEnvLocal)
    : {};
  const projectPreview = buildProjectPreviewPlaceholderRecord(pid);
  const merged = mergeSandboxEnvRecords(
    mergeSandboxEnvRecords(placeholders, projectPreview, {}),
    project,
    generated,
  );
  return `${FILE_HEADER}\n${formatDotenvBody(merged)}\n`;
}
