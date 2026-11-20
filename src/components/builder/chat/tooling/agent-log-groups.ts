/**
 * Arbetsloggens rader kommer som färdiga strängar (`AgentLogItem.label`). De
 * är av två slag som blandats i en lång lista: **uppgifter** («Körmodell:
 * gpt-6.1-sol», «Scaffold: Landing Page») och **steg** («Startar
 * own-engine-strömmen», «Generering klar (75s) — …»).
 *
 * Här delas de upp för visningen, utan att kontraktet ändras: följder av
 * uppgifter blir en tabell med nyckel och värde, steg förblir en tidslinje.
 * Ordningen bevaras, så loggen läses fortfarande uppifrån och ned.
 *
 * Ren modul: ingen React, ingen DOM.
 */
import type { AgentLogItem } from "./types";

export interface AgentLogFact {
  key: string;
  value: string;
}

export type AgentLogGroup =
  | { kind: "facts"; facts: AgentLogFact[] }
  | { kind: "step"; item: AgentLogItem };

/** En nyckel är en kort etikett, inte en mening. */
const FACT_KEY_MAX_CHARS = 32;
/** Längre värden är löptext och hör hemma i tidslinjen. */
const FACT_VALUE_MAX_CHARS = 120;

/**
 * Tolka en rad som uppgift. `null` när raden är ett steg: den saknar
 * «nyckel: värde»-formen, nyckeln är en mening, raden misslyckades eller den
 * bär ett underlag att fälla ut.
 */
export function parseAgentLogFact(item: AgentLogItem): AgentLogFact | null {
  if (item.failed || item.detail) return null;
  const label = item.label.trim();
  // Kolon följt av mellanslag: «URL:er» och klockslag («12:30») är inga nycklar.
  const separator = label.indexOf(": ");
  if (separator <= 0) return null;
  const key = label.slice(0, separator).trim();
  const value = label.slice(separator + 2).trim();
  if (!key || !value) return null;
  if (key.length > FACT_KEY_MAX_CHARS || value.length > FACT_VALUE_MAX_CHARS) return null;
  if (/[.!?—–(]/u.test(key)) return null;
  return { key, value };
}

/** Gruppera raderna i visningsordning: tabeller för uppgifter, steg däremellan. */
export function groupAgentLogItems(items: readonly AgentLogItem[]): AgentLogGroup[] {
  const groups: AgentLogGroup[] = [];
  for (const item of items) {
    const fact = parseAgentLogFact(item);
    if (!fact) {
      groups.push({ kind: "step", item });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last?.kind === "facts") last.facts.push(fact);
    else groups.push({ kind: "facts", facts: [fact] });
  }
  return groups;
}
