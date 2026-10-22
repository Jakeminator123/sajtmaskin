/**
 * En input, två mottagare: builderns komposer skickar antingen till
 * byggmotorn (generering → ny version) eller till Sajtagenten (OpenClaw).
 *
 * Beslutet är deterministiskt och billigt — ingen LLM. Reglerna följer
 * planen `docs/plans/active/2026-10-22-en-chatt-sajtagenten/`:
 *
 * - En fråga förblir en fråga: frågetecken, frågeord och granskningsverb går
 *   till agenten.
 * - En uttrycklig ändringsinstruktion («byt knapptexten till Boka tid») går
 *   direkt till byggmotorn.
 * - Bilagor, Figma-länk, inspect-punkter och en chatt som inte finns ännu
 *   (init) går alltid till byggmotorn — där finns ingen agentväg.
 * - Oklart → agenten. Den kan starta bygget själv (`start_build`) när den har
 *   befogenhet, och en felroutad fråga till byggmotorn kostar en generation.
 *
 * Ordmatchning använder Unicode-gränser (`uWordRegex`) så svenska ord med
 * å/ä/ö matchar (unicode-regex.mdc).
 */

import { uWordRegex } from "@/lib/utils/unicode-word-boundary";

export type ComposerMode = "auto" | "agent" | "build";
export type ComposerRoute = "agent" | "build";
export type ComposerIntent = "agent" | "build" | "unsure";

export const COMPOSER_MODES: readonly ComposerMode[] = ["auto", "agent", "build"];

export const COMPOSER_MODE_META: Record<ComposerMode, { label: string; title: string }> = {
  auto: { label: "Auto", title: "Frågor går till Sajtagenten, ändringar till byggmotorn" },
  agent: { label: "Fråga", title: "Skicka till Sajtagenten (svarar, granskar, föreslår)" },
  build: { label: "Bygg", title: "Skicka till byggmotorn (skapar en ny version)" },
};

export function isComposerMode(value: unknown): value is ComposerMode {
  return typeof value === "string" && (COMPOSER_MODES as readonly string[]).includes(value);
}

/** Frågeord och samtalsöppningar — texten börjar med något av dessa. */
const QUESTION_OPENERS = uWordRegex(
  [
    "vad",
    "hur",
    "varför",
    "varfor",
    "när",
    "nar",
    "vilken",
    "vilka",
    "vilket",
    "vem",
    "vart",
    "kan du förklara",
    "kan du forklara",
    "kan du berätta",
    "kan du beratta",
    "förklara",
    "forklara",
    "berätta",
    "beratta",
    "finns det",
    "är det",
    "ar det",
    "borde",
    "ska jag",
    "bör jag",
    "bor jag",
    "tycker du",
    "vad tycker",
    "what",
    "how",
    "why",
    "which",
    "when",
    "who",
    "where",
    "explain",
    "should i",
    "can you explain",
    "is it",
    "are there",
    "does",
    "do you",
  ].join("|"),
  "iu",
);

/** Granskning, bedömning och diskussion — var som helst i texten. */
const REVIEW_TERMS = uWordRegex(
  [
    "granska",
    "buggranska",
    "kontrollera",
    "kolla igenom",
    "kolla om",
    "kolla på",
    "kolla pa",
    "titta på",
    "titta pa",
    "analysera",
    "bedöm",
    "bedom",
    "utvärdera",
    "utvardera",
    "feedback",
    "åsikt",
    "asikt",
    "tycker du",
    "förbättras",
    "forbattras",
    "innan publicering",
    "innan jag publicerar",
    "före publicering",
    "fore publicering",
    "redo att publicera",
    "review",
    "audit",
    "evaluate",
    "assess",
    "what can be improved",
    "any issues",
  ].join("|"),
  "iu",
);

/** Ändringsverb — texten börjar med något av dessa. */
const BUILD_OPENERS = uWordRegex(
  [
    "bygg",
    "skapa",
    "lägg till",
    "lagg till",
    "lägg in",
    "lagg in",
    "ta bort",
    "byt",
    "byt ut",
    "ändra",
    // ASCII-formen "andra" är struken med flit: den träffar det vanliga ordet
    // *andra* («Andra sidan ser konstig ut») och skulle starta ett bygge på
    // ett klagomål. En diakritlös ändringsbegäran fångas av substantiven.
    "uppdatera",
    "justera",
    "flytta",
    "ersätt",
    "ersatt",
    "centrera",
    "förstora",
    "forstora",
    "förminska",
    "forminska",
    "gör om",
    "gor om",
    "gör",
    "gor",
    "fixa",
    "rätta",
    "ratta",
    "infoga",
    "implementera",
    "designa",
    "styla",
    "färga",
    "farga",
    "döp om",
    "dop om",
    "sätt",
    "satt",
    "make",
    "add",
    "remove",
    "delete",
    "change",
    "update",
    "replace",
    "build",
    "create",
    "redesign",
    "move",
    "rename",
    "set",
    "fix",
    "insert",
    "implement",
  ].join("|"),
  "iu",
);

/** Ändringsverb var som helst i texten (svagare signal än en öppning). */
const BUILD_TERMS = uWordRegex(
  [
    "lägg till",
    "lagg till",
    "ta bort",
    "byt ut",
    "byt",
    "ändra",
    "uppdatera",
    "ersätt",
    "ersatt",
    "flytta",
    "gör om",
    "gor om",
    "add",
    "remove",
    "change",
    "replace",
    "redesign",
  ].join("|"),
  "iu",
);

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Klassa texten i sig — utan hänsyn till läge, bilagor eller om chatten finns.
 * Exporterad för tester och för komposerns live-hint.
 */
export function classifyComposerIntent(rawText: string): ComposerIntent {
  const text = normalize(rawText);
  if (!text) return "unsure";

  const lower = text.toLowerCase();
  const endsWithQuestion = /[?？]\s*$/u.test(text);
  const opensWithQuestion = QUESTION_OPENERS.test(lower) && matchesAtStart(QUESTION_OPENERS, lower);
  const opensWithBuild = matchesAtStart(BUILD_OPENERS, lower);
  const hasReview = REVIEW_TERMS.test(lower);
  const hasBuildTerm = BUILD_TERMS.test(lower);

  // En uttrycklig instruktion som BÖRJAR med ett ändringsverb vinner — «Byt
  // rubriken, vad tycker du?» är fortfarande ett uppdrag. Undantag: en
  // granskning som börjar med «Kolla …» fångas av REVIEW_TERMS nedan eftersom
  // «kolla» inte är ett byggverb.
  if (opensWithBuild && !endsWithQuestion) return "build";
  if (endsWithQuestion || opensWithQuestion || hasReview) return "agent";
  if (opensWithBuild || hasBuildTerm) return "build";
  return "unsure";
}

function matchesAtStart(regex: RegExp, lower: string): boolean {
  const match = regex.exec(lower);
  if (!match) return false;
  // Tillåt inledande skiljetecken/citat men inget ord före träffen.
  const prefix = lower.slice(0, match.index);
  return !/[\p{L}\p{N}]/u.test(prefix);
}

export interface ResolveComposerRouteInput {
  mode: ComposerMode;
  text: string;
  /** `false` före första bygget — init går alltid till byggmotorn. */
  hasChat: boolean;
  /** Bilagor, Figma-länk eller inspect-punkter följer bara byggmotorn. */
  hasAttachments: boolean;
  /** Sajtagentens yta är aktiverad och nåbar från den här buildern. */
  agentAvailable: boolean;
  /**
   * Agenten får starta byggen själv (`start_build` kräver armerad autonomi).
   * Utan det går oklar text till byggmotorn: en ändringsbegäran som hamnar
   * hos en agent som inte kan bygga blir bara ett extra klick för användaren.
   * Utelämnad → behandlas som sant.
   */
  agentCanBuild?: boolean;
}

/** Slutgiltigt val för ett utskick från komposern. */
export function resolveComposerRoute(input: ResolveComposerRouteInput): ComposerRoute {
  if (!input.agentAvailable) return "build";
  if (!input.hasChat) return "build";
  if (input.hasAttachments) return "build";
  if (input.mode === "agent") return "agent";
  if (input.mode === "build") return "build";
  const intent = classifyComposerIntent(input.text);
  if (intent === "build") return "build";
  if (intent === "agent") return "agent";
  return input.agentCanBuild === false ? "build" : "agent";
}
