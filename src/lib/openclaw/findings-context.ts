/**
 * OpenClaw findings context (Fas 1).
 *
 * Surfaces the REAL verify/repair findings already persisted in
 * `engine_version_error_logs` (quality-gate failures, server-repair outcomes,
 * preview-VM build errors) so the Sajtagenten can answer bug questions with
 * concrete diagnostics instead of guessing. Deliberately compact: it reuses the
 * persisted `errorManifest` (file -> diagnostics) and never ships full source.
 *
 * The pure `formatOpenClawFindingsBlock` is split out so it is unit-testable
 * without a database. The single DB read lives in `review-context.ts`.
 */

export interface OpenClawFindingRow {
  level: string | null;
  category: string | null;
  message: string | null;
  meta: unknown;
}

const MAX_ROWS = 8;
const MAX_MANIFEST_FILES = 6;
const MAX_DIAGS_PER_FILE = 3;
const MAX_BLOCK_CHARS = 6_000;
const MESSAGE_MAX = 200;
const DIAG_MSG_MAX = 140;

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function isBugLevel(level: string | null): boolean {
  const normalized = (level ?? "").toLowerCase();
  return normalized === "warning" || normalized === "error";
}

function extractFailedChecks(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const checks = (meta as Record<string, unknown>).checks;
  if (!Array.isArray(checks)) return [];
  return checks
    .filter(
      (check): check is Record<string, unknown> =>
        Boolean(check) && typeof check === "object" &&
        (check as Record<string, unknown>).passed === false,
    )
    .map((check) => clip(check.check, 24))
    .filter(Boolean);
}

function extractManifestLines(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const manifest = (meta as Record<string, unknown>).errorManifest;
  if (!Array.isArray(manifest)) return [];

  const lines: string[] = [];
  for (const entry of manifest.slice(0, MAX_MANIFEST_FILES)) {
    if (!entry || typeof entry !== "object") continue;
    const file = clip((entry as Record<string, unknown>).file, 160);
    if (!file) continue;
    lines.push(`  • ${file}`);
    const diagnostics = (entry as Record<string, unknown>).diagnostics;
    if (!Array.isArray(diagnostics)) continue;
    for (const diag of diagnostics.slice(0, MAX_DIAGS_PER_FILE)) {
      if (!diag || typeof diag !== "object") continue;
      const record = diag as Record<string, unknown>;
      const source = clip(record.source, 20) || "diag";
      const line = typeof record.line === "number" ? `:${record.line}` : "";
      const message = clip(record.message, DIAG_MSG_MAX);
      if (message) lines.push(`      - [${source}${line}] ${message}`);
    }
  }
  return lines;
}

/**
 * Pure formatter: turn the persisted finding rows into a compact
 * `[BUGGFYND]` system block, or null when there is nothing actionable.
 */
export function formatOpenClawFindingsBlock(
  rows: OpenClawFindingRow[],
): string | null {
  const relevant = rows.filter((row) => isBugLevel(row.level));
  if (relevant.length === 0) return null;

  const parts: string[] = [
    "[BUGGFYND] Senaste verifierings-/reparationsfynd för aktuell version. Använd dem för att svara konkret om buggar. Hitta aldrig på filer eller fel som inte står här.",
  ];

  let manifestEmitted = false;
  for (const row of relevant.slice(0, MAX_ROWS)) {
    const level = (row.level ?? "").toLowerCase();
    const category = clip(row.category, 40) || "okänd";
    const message = clip(row.message, MESSAGE_MAX);
    parts.push(`- [${level}|${category}] ${message}`);

    const failedChecks = extractFailedChecks(row.meta);
    if (failedChecks.length > 0) {
      parts.push(`    misslyckade kontroller: ${failedChecks.join(", ")}`);
    }

    if (!manifestEmitted) {
      const manifestLines = extractManifestLines(row.meta);
      if (manifestLines.length > 0) {
        parts.push("    berörda filer:");
        parts.push(...manifestLines);
        manifestEmitted = true;
      }
    }
  }

  parts.push("[/BUGGFYND]");
  const block = parts.join("\n");
  if (block.length > MAX_BLOCK_CHARS) {
    return `${block.slice(0, MAX_BLOCK_CHARS)}\n… (avkortat)\n[/BUGGFYND]`;
  }
  return block;
}
