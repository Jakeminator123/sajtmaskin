/**
 * Deterministic dossier selection.
 *
 * Algorithm:
 *   1. Read `requestedCapabilities` (from explicit option or `brief.requestedCapabilities`).
 *   2. For each capability, find matching dossiers via `getDossiersByCapability`.
 *   3. If multiple match, pick the one with `defaultForCapability=true`,
 *      else the first by id-sort.
 *   4. For hard dossiers, check `process.env` for required envVars
 *      → mark `configured: true|false`. Hard+unconfigured still injects code,
 *      the system prompt instructs the codegen LLM to render an
 *      "unconfigured" placeholder UI.
 *   5. Eagerly load `instructions.md` for selected dossiers (small files).
 *
 * No embeddings. No fuzzy match. No domain-veto. No caps. No boost.
 * What the brief asks for is what gets injected.
 */
import {
  getAllDossiers,
  getDossierInstructions,
  getDossiersByCapability,
} from "./registry";
import type { DossierEntry, DossierSelectionResult, SelectedDossier } from "./types";

export interface SelectDossiersOptions {
  /** Explicit capability list (preferred). */
  requestedCapabilities?: string[];
  /** Fallback: read `requestedCapabilities` off the brief object. */
  brief?: Record<string, unknown> | null;
}

function isConfigured(entry: DossierEntry): boolean {
  if (!entry.envVars || entry.envVars.length === 0) return true;
  for (const ev of entry.envVars) {
    if (!ev.required) continue;
    const value = process.env[ev.key];
    if (!value || value.trim().length === 0) return false;
  }
  return true;
}

function normalizeCapabilities(opts: SelectDossiersOptions): string[] {
  const fromArg = (opts.requestedCapabilities ?? [])
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean);
  if (fromArg.length > 0) return Array.from(new Set(fromArg));
  const briefCaps =
    opts.brief && typeof opts.brief === "object"
      ? (opts.brief as { requestedCapabilities?: unknown }).requestedCapabilities
      : null;
  if (Array.isArray(briefCaps)) {
    return Array.from(
      new Set(briefCaps.map((s) => String(s).trim().toLowerCase()).filter(Boolean)),
    );
  }
  return [];
}

function pickForCapability(cap: string): {
  entry: DossierEntry;
  reason: SelectedDossier["reason"];
} | null {
  const candidates = getDossiersByCapability(cap);
  if (candidates.length === 0) return null;
  // Sort first so both the default-search and the fallback are deterministic
  // even if two dossiers accidentally have defaultForCapability=true (last-
  // touched-wins in dirent iteration is undesirable cross-machine).
  const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  const defaults = sorted.filter((c) => c.defaultForCapability);
  if (defaults.length > 1) {
    console.warn(
      `[dossiers] capability '${cap}' has ${defaults.length} dossiers with defaultForCapability=true: ${defaults
        .map((d) => d.id)
        .join(", ")}. Picking '${defaults[0].id}' deterministically.`,
    );
  }
  if (defaults[0]) return { entry: defaults[0], reason: "capability-match" };
  return { entry: sorted[0], reason: "default-fallback" };
}

export function selectDossiersForRequest(
  opts: SelectDossiersOptions,
): DossierSelectionResult {
  const all = getAllDossiers();
  const capabilities = normalizeCapabilities(opts);

  const selected: SelectedDossier[] = [];
  const byCapability: Record<string, string[]> = {};

  for (const cap of capabilities) {
    const pick = pickForCapability(cap);
    if (!pick) continue;
    const entry: DossierEntry = {
      ...pick.entry,
      instructions:
        pick.entry.instructions || getDossierInstructions(pick.entry.class, pick.entry.id),
    };
    selected.push({
      entry,
      reason: pick.reason,
      configured: isConfigured(entry),
    });
    (byCapability[cap] ??= []).push(entry.id);
  }

  return {
    selected,
    poolSize: all.length,
    byCapability,
  };
}
