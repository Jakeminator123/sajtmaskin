/**
 * Klassning av Sajtagentens meddelanden för den gemensamma builderchatten.
 *
 * Interna väckningar (`[Automatisk fortsättning]`, `[Automatisk väckning]`,
 * `[Byggresultat]`) skickas genom samma `send` som användartext så att
 * modellen får dem som user-turer. I chatten får de däremot aldrig se ut som
 * något användaren skrev: de renderas som en kort statusrad.
 *
 * `kind` sätts när meddelandet skapas; prefixkontrollen är fallback för
 * rader som persisterats innan fältet fanns.
 */

export type AgentMessageKind = "chat" | "internal";

export interface AgentMessageKindInput {
  role: "user" | "assistant";
  content: string;
  kind?: AgentMessageKind | null;
}

/** Prefix → statusrad. Ordningen spelar ingen roll; prefixen är disjunkta. */
const INTERNAL_TURN_LABELS: ReadonlyArray<{ prefix: string; label: string }> = [
  { prefix: "[Automatisk fortsättning]", label: "Sajtagenten läser byggresultatet" },
  { prefix: "[Automatisk väckning]", label: "Sajtagenten förbereder nästa steg" },
  { prefix: "[Byggresultat]", label: "Sajtagenten tittar på den nya versionen" },
  { prefix: "[Filinnehåll]", label: "Sajtagenten läser filer" },
];

export const AGENT_INTERNAL_TURN_PREFIXES: readonly string[] = INTERNAL_TURN_LABELS.map(
  (entry) => entry.prefix,
);

function matchInternalPrefix(content: string): { prefix: string; label: string } | null {
  const trimmed = content.trimStart();
  for (const entry of INTERNAL_TURN_LABELS) {
    if (trimmed.startsWith(entry.prefix)) return entry;
  }
  return null;
}

/** Är det här en maskinskapad tur som inte ska visas som användarbubbla? */
export function classifyAgentMessage(message: AgentMessageKindInput): AgentMessageKind {
  if (message.kind === "internal") return "internal";
  if (message.kind === "chat") return "chat";
  if (message.role !== "user") return "chat";
  return matchInternalPrefix(message.content) ? "internal" : "chat";
}

/** Kort svensk statusrad för en intern tur. */
export function describeInternalAgentTurn(content: string): string {
  return matchInternalPrefix(content)?.label ?? "Sajtagenten arbetar vidare";
}
