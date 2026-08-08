/**
 * Follow-up capability detection (Plan 06).
 *
 * Init prompts go through a Deep Brief that fills `brief.requestedCapabilities`
 * declaratively. Follow-ups skip the Deep Brief by design (delta-operation —
 * see `server-auto-brief-policy.ts`), which means the *only* signal we have
 * for "the user wants to ADD a capability on top of the existing site" is the
 * raw follow-up text. Plan 01 smoke run 2 demonstrated the gap: the prompt
 * "Skapa en 3d-kaffekopp som hoovrar och flyger ovanför" survived as
 * `followUpIntent: neutral` and produced an empty `coffee-cup-3d.tsx` shell
 * because no dossier was ever injected.
 *
 * This module is the canonical detector. It maps Swedish + English follow-up
 * phrases onto the dossier capabilities defined in
 * `data/dossiers/_index/capability-map.json`, and assigns a *specificity tier*
 * per match so the downstream pipeline (and Plan 07) knows whether to:
 *
 * | Tier              | Plan 07 routing                                  |
 * |-------------------|--------------------------------------------------|
 * | `generic`         | Inject the dossier verbatim, nothing else        |
 * | `specific`        | Inject the dossier shell + LLM custom on top     |
 * | `beyond-dossier`  | Inject the dossier as base + custom scene/file   |
 *
 * Plan 06 stops at *detection + tiering*. Routing onto custom-generation
 * paths (e.g. mutating package.json with three/r3f, generating a custom
 * scene file) is Plan 07 territory.
 */

import { CAPABILITY_VOCABULARY } from "./follow-up-capability-vocabulary";
import { isCapabilityNegated, isTermFullyNegated } from "./prompt-negation";

export type CapabilitySpecificityTier = "generic" | "specific" | "beyond-dossier";

export interface DetectedCapability {
  /** Dossier-vocabulary capability id (matches `data/dossiers/_index/capability-map.json`). */
  capability: string;
  /** See {@link CapabilitySpecificityTier}. */
  tier: CapabilitySpecificityTier;
  /** Concrete substring(s) that triggered the match (debug + telemetry). */
  matchedKeywords: string[];
}

export interface FollowUpCapabilityDetection {
  capabilities: DetectedCapability[];
  /** Convenience: just the capability ids in detection order. */
  capabilityIds: string[];
  /** Convenience map: capability id -> tier. */
  tierByCapability: Record<string, CapabilitySpecificityTier>;
  /** Effective word count of the trimmed message (used for tier sizing). */
  wordCount: number;
  /**
   * Plan 11 / open-question #12: true when the prompt names a dossier
   * capability AND uses a `MODIFY_REFERENCE_MARKERS` token (e.g.
   * "pricken", "bubblan", "den 3D-grejen"). The caller should treat the
   * follow-up as `capability-modify` rather than `capability-add` and
   * suppress dossier-shell re-injection — the existing scene file
   * already exists, the LLM should mutate it instead of overwriting it
   * with a placeholder shell.
   */
  referencesExistingCapability: boolean;
  /** The actual modify-reference tokens that triggered `referencesExistingCapability`. */
  modifyReferenceMatches: string[];
}

/**
 * Per-capability "this prompt clearly asks for X but X is bigger than what
 * the dossier shell delivers" markers. When matched, tier escalates to
 * `beyond-dossier` (dossier still injected as base; LLM is told to write
 * a custom scene/file on top).
 *
 * Intentionally narrow: every entry must be a concrete signal that the
 * dossier alone cannot satisfy. Adding random nouns here would silently
 * push trivial requests into custom-codegen territory and erase the
 * dossier's deterministic guarantees.
 */
const BEYOND_DOSSIER_MARKERS: Record<string, RegExp[]> = {
  "visual-3d": [
    // Physics simulation — three-fiber-canvas dossier ships a vanilla scene,
    // not @react-three/rapier. Smoke run example: "physics-simulation av
    // studsande tomater" should escalate so plan 07 generates a real
    // physics scene on top of the canvas shell.
    /(?<![\p{L}\p{N}_])(?:physics(?:[-\s]?simulation)?|fysik(?:simulering)?|simulering|particle\s+system|partikelsystem|fluid\s+dynamics|@?react-three\/rapier|rapier|cannon|matter\.js)(?![\p{L}\p{N}_])/iu,
    // Custom scene-mechanic verbs ("studsa", "kollidera", "interaktiv canvas
    // där man …") — the canvas shell does not interpret painting, dragging,
    // bouncing or cursor-driven gameplay; LLM must write the behaviour.
    /(?<![\p{L}\p{N}_])(?:studs(?:ande|ar|a|er)?|kolliderar?|interaktiv\s+canvas\s+där\s+man|paint(?:ing)?\s+on\s+(?:the\s+)?canvas|måla(?:r|s)?\s+(?:på|i)\s+canvas|drag\s+to\s+rotate)(?![\p{L}\p{N}_])/iu,
  ],
};

/**
 * Behavioural-detail markers that turn `generic` into `specific`. Generic =
 * "lägg till en 3D-grej" → just inject dossier. Specific = "3D-canvas där
 * man målar och animation skiftar nyanser medan man målar" → inject dossier
 * + tell LLM to layer behaviour on top.
 */
/**
 * "Add this capability" verbs in Swedish + English. Detection requires either
 * one of these verbs in the message OR a very short prompt where the
 * capability noun *is* the entire request (e.g. "kontaktform"). Without this
 * gate, a refine/movement prompt that mentions an existing dossier-mappable
 * section would false-trigger as `capability-add`. Concrete failure that
 * motivated this guard:
 *
 *   "Move the pricing section above FAQ" — no add verb, two capability
 *   nouns (pricing + faq). Pre-guard: detected as capability-add and would
 *   have re-injected dossiers on what is plainly a layout edit. Post-guard:
 *   no add verb, no detection, falls through to `clear-refine` as expected.
 */
/**
 * STRONG: the user names an action to perform. These survive a refine verb
 * elsewhere in the message, because "lägg till ett kontaktformulär och flytta
 * det högst upp" is an add with a placement wish attached — not a layout edit.
 */
const STRONG_ADD_VERB_PATTERNS: RegExp[] = [
  // Partikelvarianterna "lägg IN/DIT", "sätt in/dit" och "stoppa in" betyder
  // exakt samma sak som "lägg till" men saknades fram till 2026-08-08. Prod
  // den dagen: "Lägg in en karta på vart detta är.. (i arvidsjaur)" (10 ord,
  // alltså över kortprompt-undantaget) detekterade ingenting, `maplibre-map`
  // injicerades aldrig, och modellen frihandsade en <img> mot en nedlagd
  // static-map-tjänst som bildvalideringen sedan bytte mot en platshållare.
  // Att önskeformen "skulle vilja SÄTTA IN" redan låg i mönstret nedan
  // gjorde luckan asymmetrisk: det artiga läget öppnade gaten, imperativen
  // gjorde det inte.
  /(?<![\p{L}\p{N}_])(?:lägg(?:er|de)?\s+(?:till|in|dit)|sätt(?:er|te)?\s+(?:in|dit)|stoppa(?:r|de)?\s+in|infoga(?:r|de)?|inkludera(?:r|de)?|skapa(?:r|de)?|bygg(?:er|de)?|gör|designa(?:r|de)?|implementera(?:r|de)?|aktivera(?:r|de)?|koppla(?:r|de)?\s+(?:på|in))(?![\p{L}\p{N}_])/iu,
  // Artigt önskeläge med efterföljande handlingsverb: "jag skulle vilja lägga
  // till / sätta in / koppla …". Rena önskeformer ligger i WEAK nedan.
  /(?<![\p{L}\p{N}_])skulle\s+vilja\s+(?:lägga\s+till|sätta\s+in|koppla|bygga|skapa|aktivera|integrera)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:add|insert|include|build|create|implement|set\s+up|wire\s+up|hook\s+up|enable|integrate)(?![\p{L}\p{N}_])/iu,
];

/**
 * WEAK: desire and modal forms. The exact same words carry a refine prompt just
 * as naturally — "Flytta formuläret, det ska jag kunna nå från mobilen" is
 * plainly a move — so a refine/move verb in the message wins over these.
 *
 * The split exists because treating every add-signal as equally strong got the
 * gate wrong in both directions. Before 2026-08-02 a weak signal alone opened
 * it, so a layout move re-injected dossier shells (the reported defect). A
 * first fix let refine veto *all* add verbs, which suppressed plain requests
 * like "lägg till kortbetalning och byt färg på knappen" — the costlier
 * direction, since the user then asks for a capability and silently gets none.
 */
const WEAK_ADD_VERB_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:vi\s+)?(?:vill\s+ha|behöver|önskar|ska\s+(?:ha|kunna)|borde\s+ha|måste\s+ha)(?![\p{L}\p{N}_])/iu,
  // V2 word order (prod 2026-07-31, "springa"-sajten): "Denna ska jag kunna
  // klicka på…" — subjektet hamnar MELLAN "ska" och "kunna", så
  // `ska\s+(?:ha|kunna)` ovan missar den vanligaste talspråksformen.
  /(?<![\p{L}\p{N}_])ska(?:ll)?\s+(?:jag|vi|man|du|ni|hen|hon|han|den|det|de|besökar(?:e|na)|användar(?:e|na)|kunder(?:na)?)\s+(?:ha|kunna|få)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])skulle\s+vilja\s+(?:ha|kunna|testa|prova)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:ha\s+(?:en|ett|några))(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:i\s+want|we\s+want|i\s+need|we\s+need|should\s+have|need\s+to\s+have|needs?\s+a)(?![\p{L}\p{N}_])/iu,
];

function hasStrongAddVerb(message: string): boolean {
  return STRONG_ADD_VERB_PATTERNS.some((re) => re.test(message));
}

function hasWeakAddVerb(message: string): boolean {
  return WEAK_ADD_VERB_PATTERNS.some((re) => re.test(message));
}

/** Refine / move / change verbs without an add verb suppress detection. */
const REFINE_OR_MOVE_VERB_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:flytta(?:r|de|t)?|byt(?:er|t)?|ändra(?:r|de|t)?|justera(?:r|de)?|trimma(?:r|de)?|fixa(?:r|de)?|uppdatera(?:r|de)?|förfina(?:r|de)?|förbättra(?:r|de)?)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:move|change|tweak|fix|update|refine|polish|improve|adjust|swap|rename)(?![\p{L}\p{N}_])/iu,
];

function hasRefineOrMoveVerb(message: string): boolean {
  return REFINE_OR_MOVE_VERB_PATTERNS.some((re) => re.test(message));
}

/**
 * Explicit credential mention ("openai-api-key", "min api-nyckel", "secret
 * key"). A user who talks about an API key is wiring an INTEGRATION — never a
 * pure layout/refine edit — so the mention opens the detection gate even when
 * every add-verb is missing or misspelled.
 *
 * Concrete failure that motivated this (prod 2026-07-31, "springa"-sajten):
 *
 *   "Jag vil ah en 'sko' som är som en ikon för en chatbot. … Jag har en
 *    openai-api-key so mjag sean skulle vilja sätta in i produktion …"
 *
 *   Typos ("vil ah" för "vill ha") gjorde att inget add-verb träffade, gate:n
 *   stängde detektionen, `openai-chat`-dossiern injicerades aldrig — och
 *   modellen frihandsgenererade en hårdkodad demo-chatbot utan `/api/chat`.
 *   Användaren sparade sedan en riktig nyckel + körde F3 + publicerade, men
 *   sajten saknade själva serverintegrationen så chatten kunde aldrig fungera.
 *
 * Precision: gate-öppning är inte detektion — vokabulären måste fortfarande
 * träffa en capability-substantiv, så "byt ut api-nyckeln" (ingen capability)
 * detekterar fortfarande ingenting.
 */
const INTEGRATION_CREDENTIAL_CUE_PATTERNS: RegExp[] = [
  // "api-key" / "api key" / "api-nyckel(n)" — bindestreck ingår inte i
  // look-behind-klassen, så provider-prefix ("openai-api-key") matchar också.
  /(?<![\p{L}\p{N}_])api[-\s]?(?:key(?:s)?|nyck(?:el(?:n|ar|arna)?|lar(?:na)?))(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])apikey(?:s)?(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:secret|access)[-\s]?(?:key|token)(?![\p{L}\p{N}_])/iu,
];

function hasIntegrationCredentialCue(message: string): boolean {
  return INTEGRATION_CREDENTIAL_CUE_PATTERNS.some((re) => re.test(message));
}

/**
 * Plan 11 / open-question #12: anaphoric / deictic references to a
 * capability output that already exists on the site. When one of these
 * appears alongside a capability keyword, the user is asking to MODIFY
 * the existing scene/feature, not add a new one — re-injecting the
 * dossier shell would clobber the working `floating-coffee-overlay.tsx`
 * with a generic placeholder.
 *
 * Concrete failure that motivated this:
 *
 *   "gör pricken till en kaffekopp som häller kaffe när jag nuddar
 *    den med musen"
 *
 *   - `kaffekopp` keyword → visual-3d capability detected.
 *   - Prior pipeline classified as `capability-add` → re-injected
 *     `three-fiber-canvas` dossier shell + error-boundary on top of
 *     the working `floating-coffee-overlay.tsx`. The user saw the new
 *     shell render an empty canvas and thought the site broke.
 *
 * Pattern-design constraints:
 *   - Must require a STANDALONE word (not a substring of another) so
 *     "denna" / "dental" don't false-fire.
 *   - Must include nominal references the user actually says out loud
 *     when pointing at an on-page element ("pricken", "bubblan",
 *     "figuren", "scenen", "sak/grej + 3D-modifier").
 *   - Bare pronouns "den" / "det" alone are too noisy (every Swedish
 *     sentence uses them) — we require them with a specific
 *     verbal/positional context ("gör den till", "byt ut den mot",
 *     "den där", "den som"). Stricter than capability-add patterns
 *     because false positives here suppress dossier injection — the
 *     opposite failure mode from capability-add.
 */
const MODIFY_REFERENCE_MARKERS: RegExp[] = [
  /(?<![\p{L}\p{N}_])(?:pricken|bubbla|bubblan|cirkel|cirkeln|figuren|scenen|kuben|sfären|formen|ikonen|elementet|widgeten)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:3d[-\s]?(?:saken|grejen|grejjen|grejet|grejjet|grejer|modellen|figuren|elementet))(?![\p{L}\p{N}_])/iu,
  // Demonstrative + verb of transformation ("gör den till X", "byt ut den mot Y",
  // "ändra den så att …"). The pronoun anchors the change to an existing element.
  /(?<![\p{L}\p{N}_])(?:gör\s+(?:den|det|dem)\s+(?:till|så\s+att|en|ett))(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:byt\s+ut\s+(?:den|det|dem)\s+(?:mot|till|med))(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:ändra\s+(?:den|det|dem)\s+(?:till|så))(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:den\s+(?:där|som|jag\s+(?:har|gjorde|skapade)))(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:befintliga|existerande|nuvarande)\s+(?:3d[-\s]?)?(?:saken|grejen|modellen|figuren|scenen|elementet|bubblan|sfären|kuben)(?![\p{L}\p{N}_])/iu,
  // English equivalents — narrow set because "the X" is too noisy alone.
  /(?<![\p{L}\p{N}_])(?:turn\s+(?:it|that|the\s+\p{L}+)\s+into|change\s+(?:it|that|the\s+\p{L}+)\s+(?:to|into)|make\s+(?:it|that|the\s+\p{L}+)\s+(?:into|a))(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:the\s+(?:existing|current)\s+\p{L}+)(?![\p{L}\p{N}_])/iu,
];

function findModifyReferenceMatches(message: string): string[] {
  return findMatches(message, MODIFY_REFERENCE_MARKERS);
}

const SPECIFIC_BEHAVIOR_MARKERS: RegExp[] = [
  // Swedish relative clause introducing behaviour ("där man …", "som …",
  // "med X som …"). Narrow word-list to avoid matching every "som" in casual text.
  /(?<![\p{L}\p{N}_])där\s+man(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])som\s+(?:låter|gör|växlar|skiftar|byter|reagerar|svarar|animerar|öppnar|stänger|laddar|hämtar)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])medan\s+man(?![\p{L}\p{N}_])/iu,
  // English behavioural cue.
  /(?<![\p{L}\p{N}_])(?:that\s+(?:lets|allows|changes|reacts|switches|toggles|loads|fetches)|with\s+(?:live|interactive|dynamic|animated))(?![\p{L}\p{N}_])/iu,
  // Multiple coordinated requirements — "X med Y och Z" / "X with Y and Z".
  /(?<![\p{L}\p{N}_])med\s+\p{L}+\s+och\s+\p{L}+(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])with\s+\p{L}+\s+and\s+\p{L}+(?![\p{L}\p{N}_])/iu,
];

const GENERIC_TIER_WORD_BUDGET = 8;

function uniquePreservingOrder<T>(values: Iterable<T>): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function countWords(message: string): number {
  const trimmed = message.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/u).length;
}

function findMatches(message: string, patterns: RegExp[]): string[] {
  const matched: string[] = [];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && typeof match[0] === "string") {
      matched.push(match[0]);
    }
  }
  return matched;
}

function resolveTier(params: {
  capability: string;
  message: string;
  wordCount: number;
}): CapabilitySpecificityTier {
  const { capability, message, wordCount } = params;
  const beyondPatterns = BEYOND_DOSSIER_MARKERS[capability];
  if (beyondPatterns && beyondPatterns.some((re) => re.test(message))) {
    return "beyond-dossier";
  }
  const hasBehaviorMarker = SPECIFIC_BEHAVIOR_MARKERS.some((re) => re.test(message));
  if (hasBehaviorMarker) return "specific";
  if (wordCount > GENERIC_TIER_WORD_BUDGET) return "specific";
  return "generic";
}

/**
 * Detect dossier-mappable capabilities in a follow-up prompt.
 *
 * @returns Empty result for empty / unrelated prompts. The caller should treat
 *          a non-empty `capabilities` array as the trigger to classify the
 *          follow-up intent as `capability-add` and to merge the resulting
 *          ids into `selectDossiersForRequest`.
 */
export function detectFollowUpCapabilities(
  message: string,
  options?: { mode?: "followUp" | "init" },
): FollowUpCapabilityDetection {
  const trimmed = String(message ?? "").trim();
  const wordCount = countWords(trimmed);
  if (!trimmed) {
    return {
      capabilities: [],
      capabilityIds: [],
      tierByCapability: {},
      wordCount: 0,
      referencesExistingCapability: false,
      modifyReferenceMatches: [],
    };
  }

  // Plan 11 / open-question #12: pre-compute modify-reference matches so
  // a prompt like "gör pricken till en kaffekopp …" can flag
  // `referencesExistingCapability` even when the verb is `gör`/`turn into`
  // (which the ADD_VERB_PATTERNS list also matches). The follow-up
  // pipeline will branch on this flag to suppress dossier-shell
  // re-injection when both signals are present.
  const modifyReferenceMatches = findModifyReferenceMatches(trimmed);

  // See the add-verb pattern tables for the rationale: refine/move prompts that
  // happen to mention dossier-mappable nouns ("Move the pricing section above
  // FAQ") must not be misclassified as capability-add. We require either an add
  // verb or a very short prompt that *is* the capability noun.
  const refineOrMoveVerbPresent = hasRefineOrMoveVerb(trimmed);
  const addVerbPresent =
    hasStrongAddVerb(trimmed) || (hasWeakAddVerb(trimmed) && !refineOrMoveVerbPresent);
  const veryShortNounOnly = wordCount <= 4;
  // Plan 11 / open-question #12: a modify-reference is itself a strong
  // detection trigger ("byt ut den mot en kaffekopp" has no add verb and
  // no refine verb that the existing pipeline tolerates, but is plainly
  // a capability-modify request and must reach the dossier branch).
  // Credential-cue (2026-07-31): an explicit API-key mention is integration
  // intent and opens the gate even when stavfel gömmer varje add-verb — se
  // INTEGRATION_CREDENTIAL_CUE_PATTERNS ovan för det konkreta prod-fallet.
  const allowDetection =
    options?.mode === "init" ||
    addVerbPresent ||
    (veryShortNounOnly && !refineOrMoveVerbPresent) ||
    modifyReferenceMatches.length > 0 ||
    hasIntegrationCredentialCue(trimmed);
  if (!allowDetection) {
    return {
      capabilities: [],
      capabilityIds: [],
      tierByCapability: {},
      wordCount,
      referencesExistingCapability: false,
      modifyReferenceMatches: [],
    };
  }

  const detections: DetectedCapability[] = [];
  for (const entry of CAPABILITY_VOCABULARY) {
    const matchedKeywords = findMatches(trimmed, entry.patterns);
    if (matchedKeywords.length === 0) continue;
    if (isCapabilityNegated(trimmed, entry.capability)) continue;
    // Provider-negation, positiva träffar (Codex P2 på #445, spegelfallet):
    // "add a contact form, no postgres" matchar `database`-mönstret bara via
    // den NEGERADE providern — kräv minst ett mönster med en förekomst
    // utanför negationsfönstren. "använd mongodb, inte postgres" överlever
    // (mongodb-förekomsten är icke-negerad i samma mönster).
    const hasPositiveMatch = entry.patterns.some(
      (re) => re.test(trimmed) && !isTermFullyNegated(trimmed, re),
    );
    if (!hasPositiveMatch) continue;
    // Provider-negation, veton (Codex P2 på #445): en NEGERAD konkurrent får
    // inte tysta capabilityn — "lägg till postgres, inte prisma" är en
    // explicit positiv postgres-ask, inte ett Prisma-val.
    if (
      entry.vetoes &&
      entry.vetoes.some((re) => re.test(trimmed) && !isTermFullyNegated(trimmed, re))
    ) {
      continue;
    }
    const tier = resolveTier({
      capability: entry.capability,
      message: trimmed,
      wordCount,
    });
    detections.push({ capability: entry.capability, tier, matchedKeywords });
  }

  // Beyond-dossier markers double as detection triggers: "lägg till
  // physics-simulation av studsande tomater" mentions no `3d`/`webgl` token
  // but is unambiguously a visual-3d request that escalates past the
  // shell. Without this pass the vocabulary would miss the capability and
  // the prompt would fall through to `clear-refine`, leaving Plan 07 with
  // nothing to build on.
  const detectedCapabilityIds = new Set(detections.map((d) => d.capability));
  for (const [capability, markers] of Object.entries(BEYOND_DOSSIER_MARKERS)) {
    if (detectedCapabilityIds.has(capability)) continue;
    const beyondMatches = findMatches(trimmed, markers);
    if (beyondMatches.length === 0) continue;
    detections.push({
      capability,
      tier: "beyond-dossier",
      matchedKeywords: beyondMatches,
    });
  }

  const capabilityIds = uniquePreservingOrder(detections.map((d) => d.capability));
  const tierByCapability: Record<string, CapabilitySpecificityTier> = {};
  for (const det of detections) {
    // First wins — vocabulary order is curated so the most specific
    // capability for an ambiguous phrase comes first.
    if (!tierByCapability[det.capability]) {
      tierByCapability[det.capability] = det.tier;
    }
  }

  // Plan 11 / open-question #12: only flag `referencesExistingCapability`
  // when at least one capability was actually detected. A bare "byt ut
  // den mot något snyggare" without a capability noun is not a dossier
  // signal at all and should fall through to refine/redesign classifiers.
  const referencesExistingCapability =
    capabilityIds.length > 0 && modifyReferenceMatches.length > 0;

  return {
    capabilities: detections,
    capabilityIds,
    tierByCapability,
    wordCount,
    referencesExistingCapability,
    modifyReferenceMatches,
  };
}
