/**
 * Deterministic "add this building block" request format.
 *
 * The Byggblock-panelens katalog-tab sends a chat message when the user picks
 * a dossier. Capability detection for follow-ups is keyword-driven
 * (`detectFollowUpCapabilities` + `CAPABILITY_VOCABULARY`), and most manifest
 * labels ("Besöksstatistik", "FAQ Accordion", …) match no vocabulary entry —
 * so a label-only prompt would be a silent no-op: no capability requested,
 * no dossier injected.
 *
 * This module owns both sides of the deterministic contract:
 *
 *  - {@link buildAddDossierMessage} — the CLIENT format:
 *    `Lägg till byggblocket "<label>" (id: <dossier-id>)`. The label stays in
 *    the prompt on purpose: sibling-keyword disambiguation
 *    (`relevanceKeywords` in `pickForCapability`, select.ts) reads the prompt
 *    text, so "MongoDB Atlas" still picks the mongodb sibling instead of the
 *    capability default.
 *  - {@link detectRequestedDossierIds} — the SERVER pre-detector: extracts
 *    `(id: …)` markers adjacent to the word "byggblock"/"byggblocket".
 *  - {@link mergeDossierIdCapabilities} — merges the id-resolved capabilities
 *    into a `FollowUpCapabilityDetection` result, so the ordinary
 *    `requestedDossierCapabilities` plumbing picks them up without any new
 *    pipeline surface. The registry lookup is injected as a callback to keep
 *    this module client-safe (the registry reads `node:fs`).
 *
 * Unicode-regex rule (`.cursor/rules/unicode-regex.mdc`): no `\b` next to
 * non-ASCII letters — `(?<![\p{L}\p{N}_])`-style look-arounds instead.
 */

import type {
  DetectedCapability,
  FollowUpCapabilityDetection,
} from "./follow-up-capability-detection";

/** Katalogvalets meddelandeformat — servern matchar `(id: …)`-markören. */
export function buildAddDossierMessage(entry: { id: string; label: string }): string {
  return `Lägg till byggblocket "${entry.label}" (id: ${entry.id})`;
}

/**
 * Matches `byggblock`/`byggblocket` followed (within 80 chars) by an
 * `(id: <kebab-id>)` marker. The distance cap keeps an id-parenthesis in a
 * later, unrelated sentence from being read as a dossier request.
 */
const DOSSIER_ID_REQUEST_PATTERN =
  /(?<![\p{L}\p{N}_])byggblock(?:et)?(?![\p{L}\p{N}_])[\s\S]{0,80}?\(id:\s*([a-z0-9-]+)\)/giu;

/** Extract requested dossier ids (deduped, lowercased) from a chat message. */
export function detectRequestedDossierIds(message: string): string[] {
  const text = typeof message === "string" ? message : "";
  if (!text) return [];
  const ids: string[] = [];
  for (const match of text.matchAll(DOSSIER_ID_REQUEST_PATTERN)) {
    const id = match[1]?.trim().toLowerCase();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Merge id-resolved capabilities into an existing detection result.
 *
 * - Unknown ids resolve to `null` and are ignored (fail-safe: no capability).
 * - Capabilities the vocabulary already detected keep their original tier
 *   (first-wins, same semantics as `detectFollowUpCapabilities`).
 * - New capabilities are appended with tier `"generic"` — an explicit catalog
 *   pick asks for the dossier as-is, nothing beyond it.
 * - `referencesExistingCapability` is deliberately NOT recomputed: an
 *   explicit id request is an ADD, and flipping the flag could reroute the
 *   round into the capability-modify branch (which suppresses injection).
 */
export function mergeDossierIdCapabilities(
  detection: FollowUpCapabilityDetection,
  message: string,
  resolveCapabilityByDossierId: (id: string) => string | null,
): FollowUpCapabilityDetection {
  const requestedIds = detectRequestedDossierIds(message);
  if (requestedIds.length === 0) return detection;

  const added: DetectedCapability[] = [];
  const existing = new Set(detection.capabilityIds);
  for (const id of requestedIds) {
    const capability = resolveCapabilityByDossierId(id)?.trim().toLowerCase() || null;
    if (!capability || existing.has(capability)) continue;
    existing.add(capability);
    added.push({
      capability,
      tier: "generic",
      matchedKeywords: [`(id: ${id})`],
    });
  }
  if (added.length === 0) return detection;

  const capabilities = [...detection.capabilities, ...added];
  const tierByCapability = { ...detection.tierByCapability };
  for (const det of added) {
    if (!tierByCapability[det.capability]) tierByCapability[det.capability] = det.tier;
  }
  return {
    ...detection,
    capabilities,
    capabilityIds: [...detection.capabilityIds, ...added.map((det) => det.capability)],
    tierByCapability,
  };
}
