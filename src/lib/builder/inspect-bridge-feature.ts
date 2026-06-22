import { isAffirmativeEnvValue, sanitizeEnvString } from "@/lib/env-affirmative";

/**
 * Inspector "bridge"-engine (instrumenterad preview + postMessage).
 *
 * Default AV — opt-in via `NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE`. Reversibel:
 * flagga av = exakt dagens beteende (map/ai/playwright orörda, ingen injektion,
 * ingen `?inspect`-param). Designunderlag:
 * `docs/plans/active/2026-06-19-inspector-rendering-arkitektur.md`.
 */

/** Query-param som buildern lägger på preview-URL:en för att be om injektion. */
export const INSPECT_BRIDGE_QUERY_PARAM = "inspect";

/** App-route som serverar det injicerade bridge-scriptet (single source of truth). */
export const INSPECT_BRIDGE_SCRIPT_ROUTE = "/api/inspect-bridge";

/** postMessage-kontrakt mellan builder (parent) och injicerad preview (child). */
export const INSPECT_BRIDGE_MESSAGE = {
  /** parent → child: slå på/av inspektionsläget */
  setMode: "sajtmaskin:inspect:set-mode",
  /** child → parent: element under muspekaren */
  hover: "sajtmaskin:inspect:hover",
  /** child → parent: element valt (klick) */
  pick: "sajtmaskin:inspect:pick",
  /** child → parent: scriptet är laddat och redo */
  ready: "sajtmaskin:inspect:ready",
} as const;

export function isInspectBridgeEnabled(): boolean {
  const raw = sanitizeEnvString(process.env.NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE)?.toLowerCase();
  return raw ? isAffirmativeEnvValue(raw) : false;
}
