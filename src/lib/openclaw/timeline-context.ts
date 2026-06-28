/**
 * OpenClaw timeline context (Fas 4).
 *
 * Builds a compact, chronological view of the verify/repair lifecycle for the
 * active version from the persisted `engine_version_error_logs` rows, so the
 * Sajtagenten can narrate timing and branching honestly — e.g. "reparationen
 * pågick ~10 s; en samtidig redigering avancerade versionen (stale-base), så
 * fixen sparades inte över din nyare ändring".
 *
 * No new DB queries: it reuses the same rows Fas 1 already reads. The pure
 * `formatOpenClawTimelineBlock` is split out for unit testing.
 */

export interface OpenClawTimelineRow {
  createdAt: Date | string | null;
  level: string | null;
  category: string | null;
  message: string | null;
  meta: unknown;
}

const RELEVANT_CATEGORY_HINTS = [
  "quality-gate",
  "server-repair",
  "server-verify",
  "preflight",
  "preview-vm",
  "verifier",
  "build",
];

const MAX_EVENTS = 12;
const MAX_BLOCK_CHARS = 4_000;
const MESSAGE_MAX = 160;

function toMs(value: Date | string | null): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function asRecord(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
}

function isRelevant(category: string | null): boolean {
  const cat = (category ?? "").toLowerCase();
  return RELEVANT_CATEGORY_HINTS.some((hint) => cat.includes(hint));
}

function isConcurrentEditSignal(category: string | null, message: string | null): boolean {
  const haystack = `${(category ?? "").toLowerCase()} ${(message ?? "").toLowerCase()}`;
  return (
    haystack.includes("superseded") ||
    haystack.includes("stale-base") ||
    haystack.includes("stale base") ||
    haystack.includes("files_json advanced") ||
    haystack.includes("newer version")
  );
}

function eventExtras(meta: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof meta.method === "string") parts.push(`metod=${meta.method}`);
  if (typeof meta.llmPasses === "number") parts.push(`pass=${meta.llmPasses}`);
  if (typeof meta.repaired === "boolean") parts.push(`lagad=${meta.repaired ? "ja" : "nej"}`);
  if (typeof meta.firstFailureCheck === "string" && meta.firstFailureCheck) {
    parts.push(`förstafel=${meta.firstFailureCheck}`);
  }
  if (typeof meta.verifyLaneDurationMs === "number" && meta.verifyLaneDurationMs > 0) {
    parts.push(`verifytid=${Math.round(meta.verifyLaneDurationMs / 100) / 10}s`);
  }
  if (typeof meta.earlyStopReason === "string" && meta.earlyStopReason) {
    parts.push(`stopp=${meta.earlyStopReason}`);
  }
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/**
 * Pure formatter: turn finding rows into a compact `[TIDSLINJE]` block ordered
 * by time, or null when there is nothing lifecycle-related to show.
 */
export function formatOpenClawTimelineBlock(
  rows: OpenClawTimelineRow[],
): string | null {
  const relevant = rows
    .filter((row) => isRelevant(row.category))
    .map((row) => ({ row, ms: toMs(row.createdAt) }))
    .sort((a, b) => {
      if (a.ms === null) return 1;
      if (b.ms === null) return -1;
      return a.ms - b.ms;
    });

  if (relevant.length === 0) return null;

  const firstMs = relevant.find((entry) => entry.ms !== null)?.ms ?? null;
  const lastMs = [...relevant].reverse().find((entry) => entry.ms !== null)?.ms ?? null;

  const parts: string[] = [
    "[TIDSLINJE] Verifierings-/reparationshändelser för aktuell version, i tidsordning (relativ tid från första händelsen). Använd för att förklara förlopp och tajming. Hitta aldrig på tider som inte står här.",
  ];

  if (firstMs !== null && lastMs !== null && lastMs >= firstMs) {
    const windowSeconds = Math.round((lastMs - firstMs) / 100) / 10;
    parts.push(`Tidsfönster: ~${windowSeconds}s över ${relevant.length} händelser.`);
  }

  let concurrentEdit = false;
  for (const { row, ms } of relevant.slice(0, MAX_EVENTS)) {
    if (isConcurrentEditSignal(row.category, row.message)) concurrentEdit = true;
    const offset =
      ms !== null && firstMs !== null ? `+${Math.round((ms - firstMs) / 100) / 10}s` : "+?";
    const level = (row.level ?? "").toLowerCase() || "info";
    const category = clip(row.category, 40) || "okänd";
    const message = clip(row.message, MESSAGE_MAX);
    parts.push(`- [${offset}] [${level}|${category}] ${message}${eventExtras(asRecord(row.meta))}`);
  }

  if (concurrentEdit) {
    parts.push(
      "Obs: en samtidig redigering avancerade versionen under pågående reparation (supersede/stale-base) — reparationen sparades inte över din nyare ändring; den nyare versionen verifierades om för sig.",
    );
  }

  parts.push("[/TIDSLINJE]");
  const block = parts.join("\n");
  if (block.length > MAX_BLOCK_CHARS) {
    return `${block.slice(0, MAX_BLOCK_CHARS)}\n… (avkortat)\n[/TIDSLINJE]`;
  }
  return block;
}
