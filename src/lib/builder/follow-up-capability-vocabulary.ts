/**
 * Capability vocabulary for follow-up detection.
 *
 * Source-of-truth for the available capability ids: dossier manifests read by
 * `src/lib/gen/dossiers/registry.ts`. The keys here MUST match those ids
 * verbatim — they are forwarded to `selectDossiersForRequest` which looks
 * dossiers up by capability. Not every capability in the pool needs an entry
 * here: `physics-3d` arrives via the
 * inferred-capability bridge. The capability count is intentionally NOT stated
 * here — it drifts; `follow-up-capability-vocabulary.test.ts` guards every
 * entry's id against the live registry instead. The CI-gated capability-map is
 * a Backoffice/tooling projection, not the runtime owner.
 *
 * Every pattern uses Unicode-aware look-arounds rather than ASCII `\b`, so
 * Swedish words with `å/ä/ö` boundary correctly. Mirrors the convention in
 * `capability-inference.ts` and `follow-up-clarification.ts`.
 *
 * **Curation rules:**
 *  - Patterns must be high-precision. False positives (e.g. matching the
 *    word "auth" inside "author") would cause stray dossier injections on
 *    every follow-up that mentions a hospitality / editorial noun.
 *  - When two capabilities can match the same phrase, the more specific one
 *    is listed first in the array. `detectFollowUpCapabilities` keeps the
 *    first tier per capability and returns capabilities in this order.
 *  - `vetoes`: optional patterns that suppress the match. Used to undo
 *    accidental hits when the prompt clearly belongs to a different domain
 *    (e.g. `payments` vetoes generic "betala räkningen" without a card
 *    instrument noun).
 *
 * **Parallel implementations — INTENTIONALLY SEPARATE:**
 * The 3D / game / physics / canvas signal families also live in two other
 * files because each consumer has a different decision threshold. Do NOT
 * merge them blindly into one shared regex bank — they emit different
 * outputs:
 *  - `src/lib/gen/capability-inference.ts` — `needs3D` / `needsPhysics` /
 *    `needsGame` boolean flags for prompt/build-spec/context-policy. Uses
 *    ASCII `\b` in some rules, Unicode boundaries in others.
 *  - `src/lib/providers/own-engine/follow-up-clarification.ts` —
 *    scaffold-freeze policy. NOTE (2026-07-03): the former
 *    `FOLLOW_UP_MAJOR_CHANGE_UNLOCK_PATTERNS` game/canvas auto-unlock was
 *    removed — a game follow-up now KEEPS the frozen scaffold (adds a new
 *    route) and only explicit clear-redesign wording unlocks a rematch. This
 *    vocabulary still detects `visual-3d`/`needsGame` for capability injection;
 *    it just no longer drives scaffold rematch.
 *
 * Touching one consumer's tokens? Read the regression matrix in
 * `src/lib/providers/own-engine/follow-up-clarification.test.ts` (describe
 * "follow-up signal regression matrix") before merging.
 */

export interface CapabilityVocabularyEntry {
  /** Must match a capability id declared by a dossier manifest in the runtime registry. */
  capability: string;
  /** At least one pattern must match the message for the capability to detect. */
  patterns: RegExp[];
  /** Optional veto patterns; if any matches, the capability is suppressed. */
  vetoes?: RegExp[];
  /**
   * Positive patterns that can survive a veto in another independent clause.
   * A survivor in the same clause as a veto remains suppressed.
   */
  vetoSurvivors?: RegExp[];
}

const UNICODE_WORD_START_SOURCE = String.raw`(?<![\p{L}\p{N}_])`;
const UNICODE_WORD_END_SOURCE = String.raw`(?![\p{L}\p{N}_])`;

/**
 * Reservation inventory excluded from the appointment-booking dossier.
 *
 * This bilingual source is shared by every booking veto so post-positive,
 * resource-first and direct-verb word orders cannot drift to different
 * resource coverage. Keep the alternatives context-free: each consuming
 * regex supplies the booking relationship that makes the veto precise.
 */
const BOOKING_INVENTORY_RESOURCE_SOURCE = String.raw`(?:(?:konferens|mötes|behandlings|hotell)rum(?:met|men|s)?|(?:event|konferens|mötes)lokal(?:en|er|erna|s)?|restaurangens\s+bord|hotellets\s+rum|restaurangbord(?:et|en|s)?|hotellrum(?:met|men|s)?|hyrutrustning(?:en|s)?|biluthyrning(?:en|s)?|cykeluthyrning(?:en|s)?|(?:padel|tennis|golf|sport)ban(?:a|an|or|orna|e|s)?|sportfält(?:et|en)?|restaurang(?:en|er)?|hotell(?:et)?|utrustning(?:en|ar|arna|s)?|fordon(?:et|en|s)?|bil(?:en|ar|arna|s)?|cykel(?:n|ar|arna|s)?|lokal(?:en|er|erna|s)?|biljett(?:en|er|erna|s)?|boende(?:t)?|bord(?:et|en|s)?|rum(?:met|men|s)?|(?:rental|hire)[-\s]+(?:cars?|vehicles?|equipment|bikes?)|(?:football|soccer|sports?)[-\s]+(?:fields?|courts?)|(?:event|conference)[-\s]+(?:spaces?|venues?|rooms?)|(?:hotel|meeting|treatment)[-\s]+rooms?|(?:restaurant[-\s]+)?tables?|(?:tennis|padel)[-\s]+courts?|restaurants?|hotels?|rooms?|courts?|fields?|spaces?|equipment|vehicles?|cars?|bikes?|venues?|tickets?|accommodation|lodging)`;

/**
 * Genuine appointment objects. Both the vocabulary and the detector's
 * capability-add gate build their action pattern from this exact source.
 */
export const BOOKING_APPOINTMENT_OBJECT_SOURCE = String.raw`(?:(?:(?:an?|the|their|our|your|his|her)\s+)?appointments?|(?:(?:a|the|their|our|your)\s+)?(?:consultations?|meetings?|services?)|(?:(?:en|sin|sina|vår|våra|er|era|deras)\s+)?(?:(?:nästa|första)\s+)?(?:ledig(?:a)?\s+)?(?:tid(?:en|er|erna)?|konsultation(?:en|er|erna)?|möte(?:t|n)?|möten(?:a)?|behandling(?:en|ar|arna)?))`;

const BOOKING_APPOINTMENT_NOUN_PATTERN =
  /(?<![\p{L}\p{N}_])(?:tidsbokning(?:en)?|appointment[-\s]?(?:booking|scheduling))(?![\p{L}\p{N}_])/iu;
const BOOKING_APPOINTMENT_ACTION_PATTERN = new RegExp(
  String.raw`${UNICODE_WORD_START_SOURCE}(?:boka|book|schedule)\s+${BOOKING_APPOINTMENT_OBJECT_SOURCE}${UNICODE_WORD_END_SOURCE}`,
  "iu",
);

export const CAPABILITY_VOCABULARY: CapabilityVocabularyEntry[] = [
  {
    capability: "visual-3d",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:3d|tre\s+dimension(?:er|ell)?|three\.?js|@?react-three(?:\/(?:fiber|drei|rapier))?|webgl|r3f)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])3d-?[\p{L}\p{N}_]+/iu,
      /(?<![\p{L}\p{N}_])(?:interaktiv\s+canvas|3d-?canvas|3d-?scen|3d-?objekt|3d-?modell|3d-?animation)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:gltf|glb|usegltf|use-gltf)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:bubbla|bubblan|sfär(?:en)?|orb(?:en)?|cirkel(?:n)?)[\s\S]{0,120}(?:flyg(?:a|er|ande)?|sväv(?:a|er|ande)?|hovr(?:a|ar|ande)?|ovanför|över)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:flyg(?:a|er|ande)?|sväv(?:a|er|ande)?|hovr(?:a|ar|ande)?|ovanför|över)[\s\S]{0,120}(?:bubbla|bubblan|sfär(?:en)?|orb(?:en)?|cirkel(?:n)?|hamburgare|burger)(?![\p{L}\p{N}_])/iu,
    ],
  },
  // Parallax entries removed 2026-07-22: the parallax dossier pair was parked
  // (utfasade-träd borttaget 2026-08-10; återställ via git-historik). Parallax intent is still
  // detected by `capability-inference.ts` (`needsParallax`) which now drives
  // freehand parallax guidance instead of dossier injection.
  {
    // Interactive game / playable mechanic — distinct from decorative visual-3d.
    // When the user asks for a playable thing (Pac-Man, Snake, Tetris, arcade,
    // quiz-game, "spel", "playable canvas") the prompt MUST reach the
    // interactive-game-loop dossier so the codegen LLM sees the
    // state+loop+controls+collision+score+restart contract.
    //
    // Vetoes keep generic nouns that collide with non-game domains from
    // over-triggering: "spelet i marknaden" / "spela upp musik" / gaming-news
    // sites are NOT game builds.
    capability: "interactive-game",
    patterns: [
      // Narrow arcade/mechanic nouns — these are game-builds almost always.
      /(?<![\p{L}\p{N}_])(?:pac-?man|pacman|snake(?:-?game)?|tetris|breakout|pong|arkanoid|space-?invaders|flappy(?:-?bird)?|asteroids|frogger|galaga)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:platformer|shoot-?em-?up|shmup|bullet-?hell|roguelike|rogue-?like|idle-?clicker|idle-?game)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:mini-?game|mini-?spel|quiz-?game|quiz-?spel|reaction-?game|reaktionsspel|memory-?game|minnesspel|puzzle-?game|pusselspel|typing-?game|skrivspel)(?![\p{L}\p{N}_])/iu,
      // Explicit "playable" / "spelbar" / "interactive game" phrases.
      /(?<![\p{L}\p{N}_])(?:playable|spelbar(?:t)?|interactive\s+game|interaktivt\s+spel|playable\s+canvas|game\s+loop|spelloop|game-?mekanik|game-?mechanic|arcade(?:-?game)?|spelhall)(?![\p{L}\p{N}_])/iu,
      // Bare "spel" / "game" — widest trigger, so vetoes below must catch
      // the common non-game uses ("tv-spel"-butik sales pitch, gaming news,
      // "spelade upp musiken"). Veto-driven prompt domain disambiguation.
      /(?<![\p{L}\p{N}_])(?:tv-?spel|video-?spel|dator-?spel|browser-?spel|webb-?spel)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:bygg(?:a)?\s+(?:ett|en|mitt)?\s*spel|skapa(?:r)?\s+(?:ett|en|mitt)?\s*spel|build\s+(?:a|me|my)?\s*game|create\s+(?:a|me|my)?\s*game)(?![\p{L}\p{N}_])/iu,
      // Game-mechanic verbs that imply actual play — score/collision/win/lose
      // in active voice, not just "show scores on a page".
      /(?<![\p{L}\p{N}_])(?:keyboard-?controls?|tangentbords-?kontroller|pil-?tangenter|arrow-?keys|wasd)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:samla\s+poäng|score-?tracking|high-?score|poängjakt|win-?condition|lose-?condition|vinstvillkor|förlorar-villkor)(?![\p{L}\p{N}_])/iu,
    ],
    // Non-game usages of "spel" / "game" / "play" that must NOT activate the
    // dossier. Vetoes are intentionally narrow: each matches a concrete
    // non-game phrase, not a broad keyword family.
    vetoes: [
      // "spela upp musik/video/ljud" = media playback, not a game.
      /(?<![\p{L}\p{N}_])spela\s+upp\s+(?:musik|en\s+video|en\s+låt|ljud|en\s+podcast)(?![\p{L}\p{N}_])/iu,
      // Analytics / gaming-news sales pages mention "gaming" / "e-sport"
      // without wanting a game build. Allow optional separator (bindestreck
      // eller mellanslag) mellan "gaming"/"spel" och butiks-/nyhetsnomen
      // så vi fångar både "gaming-news" och "gaming news".
      /(?<![\p{L}\p{N}_])(?:spel[-\s]?butik|tv-?spel\s+butik|game[-\s]?store|gaming[-\s]?news|gaming[-\s]?blog|e-?sport(?:[-\s]?nyheter)?|esport[-\s]?site)(?![\p{L}\p{N}_])/iu,
      // "spel" as part of a compound for something that is not a real game:
      // "rollspel" (role-play) in team-building context, "skådespel"
      // (theatrical performance).
      /(?<![\p{L}\p{N}_])(?:skådespel|rollspel(?:sövning)?|teaterspel)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "payments",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:stripe(?:-?betalning|-?checkout)?|klarna|swish|paypal|adyen|mollie|braintree)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:checkout|kassa|kortbetalning|kortköp|kortbetala|kreditkort)(?![\p{L}\p{N}_])/iu,
      // One-off payment vocabulary only. Recurring terms (prenumeration,
      // membership, subscription-billing) belonged to the `subscriptions`
      // capability, which left 2026-08-06 with the parked paddle-billing
      // dossier — they are deliberately NOT folded back in here, since routing
      // a recurring ask to one-off Stripe checkout was the exact bug the #475
      // split fixed. A recurring ask is ordinary page content until a
      // subscriptions dossier exists again.
      /(?<![\p{L}\p{N}_])(?:betalningsfl(?:ö|o)de|betalningsl(?:ö|o)sning|payment[-\s]?flow|checkout[-\s]?flow)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])betala\s+med\s+(?:kort|kreditkort|swish|klarna|stripe|paypal|visa|mastercard|apple\s*pay|google\s*pay)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])k(?:ö|o)p(?:a)?\s+med\s+(?:kort|kreditkort|stripe|klarna|swish|checkout)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Auth (one capability since 2026-07-22): clerk-auth is the capability
    // default; supabase-auth is a provider SIBLING under the same `auth`
    // capability. An explicit Supabase ask still reaches the Supabase dossier
    // — via the manifest `relevanceKeywords` in select.ts (the raw prompt
    // contains "supabase"), not via a separate capability. A Supabase phrase
    // also matches the plain auth cues below ("supabase login" contains
    // "login"), so no dedicated Supabase patterns are needed here.
    capability: "auth",
    patterns: [
      // `log[-\s]?in` covers the bare English "login" / "log in" forms
      // (test-sync finding 2026-07-22: "add supabase login" detected nothing).
      /(?<![\p{L}\p{N}_])(?:auth|authentication|inloggning|registrera\s+konto|logga\s+in|log[-\s]?in|sign[-\s]?in|sign[-\s]?up|register|clerk|next-?auth|auth\.js|supabase[-\s]?auth)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:lösenord|password|forgot[-\s]?password|reset[-\s]?password|återställ\s+lösenord)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:oauth|jwt|magic\s+link|session\.(?:store|cookie|token))(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Chatbot surface. openai-chat is the sole dossier under `ai-chat`
    // (ai-tool-calling-chat / rag-chat parked 2026-08-06, etapp 4). Tool-
    // calling and document-Q&A / RAG phrasing still trigger THIS capability:
    // an "AI assistant with tools" or "chatbot that answers from our
    // documents" ask is a chatbot ask; implementation is ours (same
    // precedent as MongoDB→`database` in etapp 3).
    capability: "ai-chat",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:ai-?chatt|ai-?chat|chattbot|chatbot|ai-?assistent|ai-?bot|llm-?chat|chat[-\s]?ui|chat[-\s]?widget)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:openai\s+chat|gpt-?chat|claude-?chat|chatgpt-?widget)(?![\p{L}\p{N}_])/iu,
      // Tool-calling / function-calling (folded from parked ai-tool-calling).
      /(?<![\p{L}\p{N}_])(?:tool-?calling|tool-?call(?:s|er)?|function-?calling|verktygsanrop|funktionsanrop|tool-?roundtrips?)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:ai|llm|chatt?bot|assistent(?:en)?|assistant)[\s\S]{0,60}(?:använd(?:er|a|e)?\s+verktyg|anropa(?:r)?\s+(?:verktyg|funktioner|api:?er)|call(?:s|ing)?\s+tools|uses?\s+tools|execute(?:s)?\s+tools|kör(?:a)?\s+verktyg)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:agent(?:isk)?\s+(?:chat|chatt|assistent|assistant)|ai-?agent\s+som\s+(?:kan\s+)?(?:utför|bokar|söker|hämtar|slår\s+upp))(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:assistent|assistant|chatt?bot|ai)[\s\S]{0,80}(?:som\s+kan\s+(?:utföra|boka|slå\s+upp|hämta\s+(?:live|real)-?(?:data|tid))|that\s+can\s+(?:perform|execute|look\s+up|book|fetch\s+live))(?![\p{L}\p{N}_])/iu,
      // RAG / document Q&A (folded from parked rag-chat).
      /(?<![\p{L}\p{N}_])(?:rag|rag-?chat|rag-?bot|retrieval-?augmented(?:\s+generation)?)(?![\p{L}\p{N}_])/iu,
      // Vector-store nouns — `database` vetoes these on purpose (a vector
      // store is not a database ask); they land here as chatbot intent.
      /(?<![\p{L}\p{N}_])(?:pgvector|(?:vector|vektor)[-\s]?(?:databas(?:en)?|database|db|store|search)|semantisk\s+sökning|semantic\s+search)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:kunskapsbas(?:en)?[-\s]?(?:chat|chatt|bot|assistent)|knowledge[-\s]?base\s+(?:chat|bot|assistant)|chatt?a?\s+(?:med|mot)\s+(?:vår\s+|er\s+)?kunskapsbas(?:en)?)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:chatt?a?\s+med\s+(?:våra|egna|era|sina|dina)\s+(?:dokument|filer|pdf:?er)|chat\s+with\s+(?:our|your)\s+(?:docs|documents|files))(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:dokument|document)[-\s]?q\s*&\s*a(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:chatt?bot|assistent(?:en)?|assistant|ai)[\s\S]{0,60}(?:som\s+svarar\s+(?:utifrån|från|ur|baserat\s+på)|that\s+answers\s+(?:from|based\s+on)|answering\s+from)\s+(?:våra|vara|egna|era|sina|dina|our|your|the\s+site'?s?)?\s*(?:dokument|innehåll|kunskapsbas(?:en)?|artiklar|filer|documents?|docs|content|knowledge)(?![\p{L}\p{N}_])/iu,
    ],
  },
  // `realtime` (ably-realtime) and `image-generation` (fal-image-generation)
  // left the vocabulary 2026-08-06 when their sole provider dossiers were
  // parked 2026-08-06 (träd borttaget 2026-08-10; git-historik) — a capability id
  // without a backing dossier selects nothing, so detecting it only mutes a
  // surface the model may as well freehand as ordinary page content.
  {
    // Persistent server-side data storage — postgres-drizzle is the sole
    // dossier under `database` (neon-postgres / mongodb-atlas parked
    // 2026-08-06). Mongo/Neon brand names still trigger THIS capability: a
    // MongoDB-ask is a database-ask; implementation is ours. NOT vector
    // stores (a vector-store ask is not a database ask — those phrases fold
    // into `ai-chat` since etapp 4; rag-chat no longer exists) and NOT
    // analytics/tracking.
    capability: "database",
    patterns: [
      // Core nouns, Swedish + English inflections.
      /(?<![\p{L}\p{N}_])(?:databas(?:en|er|erna)?|databases?|sql[-\s]?databas(?:en)?|sql\s+database)(?![\p{L}\p{N}_])/iu,
      // Brand / stack names that unambiguously mean a database layer.
      // Bare "neon" is intentionally NOT matched — it is a common design word
      // (neonfärger, neon-skyltar); Neon-the-DB needs a DB-flavoured
      // compound or the neon.tech domain.
      /(?<![\p{L}\p{N}_])(?:postgres(?:ql)?|drizzle(?:-?orm)?|mongo(?:db)?(?:[-\s]?atlas)?|neon[-\s]?(?:postgres(?:ql)?|db|databas(?:en)?|database)|neon\.tech)(?![\p{L}\p{N}_])/iu,
      // Verb phrases: "lagra/spara ... i (en) databas", "store/save ... in a database".
      /(?<![\p{L}\p{N}_])(?:lagra(?:r|de)?|spara(?:r|de)?|persistera(?:r|de)?)[\s\S]{0,60}i\s+(?:en\s+)?databas(?:en)?(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:store|save|persist)[\s\S]{0,60}(?:in|to)\s+(?:a\s+|the\s+)?database(?![\p{L}\p{N}_])/iu,
    ],
    // Vetoes:
    //  - Vector stores are NOT a database ask (rag-chat is parked; the
    //    phrases fold into `ai-chat` instead).
    //  - Analytics/tracking asks route to `analytics` — "spåra besökare i en
    //    databas" is a visitor-tracking request, not a persistence layer.
    //  - An explicit competing ORM/BaaS choice (Prisma, Mongoose, Supabase,
    //    Firebase, …) must not pull in the Drizzle stack — same precedent
    //    as the Chart.js veto on `dashboard-charts`.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:(?:vector|vektor)[-\s]?(?:databas(?:en)?|database|db|store|search)|pgvector|pinecone|weaviate|qdrant|chroma(?:db)?)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:plausible|google[-\s]?analytics|posthog|mixpanel|fathom|matomo|statcounter|vercel[-\s]?analytics|webbanalys|webb-?analys|besöksstatistik(?:en)?|spåra\s+besökare|track\s+visitors?|page[-\s]?views|sidvisningar)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:prisma|mongoose|sequelize|typeorm|kysely|supabase|firebase|firestore|planetscale)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "contact-form",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:kontaktform(?:ulär)?|contact[-\s]?form|kontaktsida\s+med\s+formulär|skicka\s+e-?post|skicka\s+mail|email[-\s]?form|resend)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Hosted APPOINTMENT scheduling (calcom-booking), not generic reservation
    // inventory for restaurant tables, hotel rooms, tickets or equipment.
    capability: "booking",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:cal\.com|calcom)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:bokningssystem(?:et)?|bokningskalender(?:n)?|online[-\s]?bokning|online[-\s]?booking|booking[-\s]?(?:calendar|system))(?![\p{L}\p{N}_])/iu,
      BOOKING_APPOINTMENT_NOUN_PATTERN,
      // Match the appointment action wherever it appears in a sentence, so
      // subjects, modals and possessive objects work too.
      BOOKING_APPOINTMENT_ACTION_PATTERN,
    ],
    vetoes: [
      // Booking noun followed by its inventory resource.
      new RegExp(
        String.raw`${UNICODE_WORD_START_SOURCE}(?:(?:bokningssystem(?:et)?|bokningskalender(?:n)?|tidsbokning(?:en)?|online[-\s]?bokning|bokning)\s+(?:för|av|till)\s+(?:(?:vår|våra|er|era|vårt|ert|sin|sina|ett|en)\s+)?|(?:cal\.com[-\s]?(?:booking|scheduling)|appointment[-\s]?(?:booking|scheduling)|booking[-\s]?(?:calendar|system)|online[-\s]?booking)\s+(?:for|of)\s+(?:(?:a|an|the|our|your|their)\s+)?)${BOOKING_INVENTORY_RESOURCE_SOURCE}${UNICODE_WORD_END_SOURCE}(?![-\s]+(?:staff|team|personnel)[-\s]+(?:meetings?|appointments?|consultations?))`,
        "iu",
      ),
      // Inventory-first English order and Swedish compounds. The resource
      // directly modifies the booking noun, so a later appointment location
      // ("appointments in a hotel room") cannot trigger this veto.
      new RegExp(
        String.raw`${UNICODE_WORD_START_SOURCE}${BOOKING_INVENTORY_RESOURCE_SOURCE}[-\s]*(?:bokning(?:en)?|bokningssystem(?:et)?|bokningskalender(?:n)?|booking(?:[-\s]+(?:calendar|system))?)${UNICODE_WORD_END_SOURCE}`,
        "iu",
      ),
      // Direct reservation verbs are also unambiguous resource context while
      // still allowing appointment locations such as "boka tid i ett rum".
      new RegExp(
        String.raw`${UNICODE_WORD_START_SOURCE}(?:boka|book)\s+(?:(?:ett|en|a|an|the|våra?|era?|our|your)\s+)?${BOOKING_INVENTORY_RESOURCE_SOURCE}${UNICODE_WORD_END_SOURCE}`,
        "iu",
      ),
      // Bare sport names are inventory intent only in a bounded reservation
      // relationship. Keeping them out of the shared noun bank avoids
      // suppressing appointment phrases such as "tennis coaching".
      new RegExp(
        String.raw`${UNICODE_WORD_START_SOURCE}(?:(?:(?:bokningssystem(?:et)?|online[-\s]?bokning|bokning)\s+(?:för|av|till)|(?:booking[-\s]?(?:calendar|system)|online[-\s]?booking)\s+(?:for|of))\s+(?:(?:a|an|the|our|your|ett|en|vår|vårt)\s+)?(?:padel|tennis|golf)(?=$|[.,;!?])|(?:padel|tennis|golf)[-\s]+(?:bokning(?:en)?|bokningssystem(?:et)?|booking(?:[-\s]+(?:calendar|system))?)|(?:boka|book)\s+(?:padel|tennis|golf)(?=$|[.,;!?]))`,
        "iu",
      ),
    ],
    vetoSurvivors: [
      BOOKING_APPOINTMENT_NOUN_PATTERN,
      BOOKING_APPOINTMENT_ACTION_PATTERN,
    ],
  },
  {
    capability: "newsletter-subscribe",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:nyhetsbrev|newsletter|prenumerera\s+på\s+nyhetsbrev|subscribe[-\s]?form|email[-\s]?signup|mailchimp|brevo|mailerlite)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "analytics",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:analytics|webbanalys|webb-?analys|plausible|vercel[-\s]?analytics|google[-\s]?analytics|posthog|mixpanel|fathom)(?![\p{L}\p{N}_])/iu,
      // "Besöksstatistik" är den user-synliga etiketten för analytics-dossiern
      // (Codex P2 på #482): användare skriver etiketten de ser i panelen.
      /(?<![\p{L}\p{N}_])besök(?:s|ar)-?statistik(?:en)?(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:spåra\s+besökare|track[-\s]?visitors|page[-\s]?views|sidvisningar)(?![\p{L}\p{N}_])/iu,
    ],
  },
  // `error-tracking` (sentry-error-tracking) left the vocabulary 2026-08-06
  // with its parked dossier — same rationale as the realtime/image-generation
  // note further up.
  {
    // Swipeable/auto-advancing slider. `image-gallery` / `product-gallery`
    // were intentionally REMOVED from here: a "gallery" the user wants to
    // click-to-enlarge belongs to `gallery-lightbox`, not a carousel. The
    // explicit carousel/slider/slideshow words below keep genuine slider
    // requests routing here; `explicitlyRequestsCarousel` in orchestrate.ts is
    // the F2/F3 gate that still requires one of these words before injection.
    capability: "carousel",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:carousel|karusell|bild[-\s]?karusell|produkt[-\s]?karusell|slider|swipe|swipa|slideshow|bildspel|hero[-\s]?slider|embla)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "command-palette",
    patterns: [
      // `[-\s+]?` so the literal "cmd+k" / "ctrl+k" spellings match too
      // (test-sync finding 2026-07-22: the old class lacked `+`).
      /(?<![\p{L}\p{N}_])(?:command[-\s]?palette|kommandopalett|(?:cmd|ctrl)[-\s+]?k|cmdk|spotlight[-\s]?search|sökpalett|command[-\s]?menu)(?![\p{L}\p{N}_])/iu,
    ],
    // A content-search ask ("sök på sajten", "sök bland produkterna") belongs
    // to `site-search` below — the palette is an app-navigation surface.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:sök(?:a)?\s+(?:på|i|bland)\s+(?:sajten|sidan|webbplatsen|innehållet|produkter(?:na)?|artiklar(?:na)?)|search\s+(?:the\s+)?(?:site|content|products?|articles?))(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Local site search over the site's own content (MiniSearch — key-free).
    // Distinct from `command-palette` (app navigation/actions) and chat-style
    // answers from documents (`ai-chat` since etapp 4). New capability 2026-07-22.
    capability: "site-search",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:sökfunktion(?:en)?|sökfält(?:et)?|sökruta(?:n)?|site[-\s]?search|sök(?:a)?\s+(?:på|i|bland)\s+(?:sajten|sidan|webbplatsen|innehållet|menyn|produkter(?:na)?|artiklar(?:na)?)|search\s+(?:the\s+)?(?:site|content|menu|products?|articles?)|quick[-\s]?search|minisearch|fuse\.js)(?![\p{L}\p{N}_])/iu,
    ],
    // Explicit palette or RAG intent routes to those capabilities instead.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:command[-\s]?palette|kommandopalett|cmd[-\s]?k|cmdk|command[-\s]?menu)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:rag|retrieval-?augmented|semantisk\s+sökning|semantic\s+search|pgvector|(?:vector|vektor)[-\s]?(?:databas(?:en)?|database|db|store|search))(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Map display (MapLibre + OpenFreeMap — key-free). Showing a map with
    // markers; NOT geocoding/routing/"near me" (future location-services
    // capability). New capability 2026-07-22.
    capability: "map-display",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:karta(?:n)?|kartor(?:na)?|kartvy(?:n)?|hitta\s+(?:hit|till\s+oss)|vägbeskrivning(?:en)?|maplibre|openfreemap|open[-\s]?street[-\s]?map|google\s+maps|mapbox)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:map|maps)(?![\p{L}\p{N}_])(?![-\s]?(?:reduce|filter))/iu,
      /(?<![\p{L}\p{N}_])(?:visa\s+(?:vår\s+|butikens\s+)?(?:adress|plats|läge)\s+på\s+(?:en\s+)?karta|show\s+(?:the\s+|our\s+)?(?:location|address|store)s?\s+on\s+(?:a\s+)?map|store\s+locator|butiks-?karta)(?![\p{L}\p{N}_])/iu,
    ],
    // Sitemaps and heatmaps are not maps of places.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:sitemap(?:s)?|site-?map|heat-?map(?:s)?|road-?map(?:s)?|färdplan)(?![\p{L}\p{N}_])/iu,
    ],
  },
  // Section-capability entries (faq/pricing/testimonials/logo-cloud/marquee/
  // stats-counter/feature-grid/cta-section/stepper) removed 2026-07-22: their
  // dossiers were parked 2026-07-22 (träd borttaget 2026-08-10; git-historik) — plain
  // content sections the codegen LLM writes better freehand, so a follow-up
  // like "lägg till en FAQ" is now an ordinary content edit, not a dossier
  // injection.
  {
    // Hosted storage for the owner's OWN heavy media (vercel-blob-media,
    // 2026-09-02): their MP4s / growing photo library served from a Blob store
    // instead of the repo. High-precision on purpose — a plain "lägg till en
    // video i heron" is an embed/content edit, and a click-to-enlarge gallery
    // is `gallery-lightbox` (listed after this entry so both can co-detect on
    // "ladda upp egna bilder till bildgalleriet").
    capability: "media-storage",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:mediabibliotek(?:et)?|media[-\s]?library|vercel[-\s]?blob|blob[-\s]?(?:storage|store|lagring)|fil[-\s]?lagring(?:en)?|file[-\s]?storage|media[-\s]?lagring(?:en)?)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])ladda\s+upp\s+(?:(?:egna|våra|mina|nya)\s+)?(?:bilder(?:na)?|foton|filmer(?:na)?|videor(?:na)?|videos?|videoklipp|filer(?:na)?|mp4(?:-?filer)?)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])upload\s+(?:(?:our|my|their|own|new)\s+)?(?:photos|images|pictures|videos?|files|clips)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:egna|våra|mina)\s+(?:video)?filmer(?:na)?(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])mp4(?:-?(?:filer|filmer|video(?:r|s)?))?(?![\p{L}\p{N}_])/iu,
    ],
    // Embedding a third-party video/feed is page content, not storage; and
    // visitor uploads (UGC) are explicitly outside the dossier.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:youtube|vimeo|instagram|tiktok|facebook)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:besökar(?:e|na)|kunder(?:na)?|användar(?:e|na))\s+(?:ska\s+|kan\s+|får\s+)?(?:kunna\s+)?ladda\s+upp(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:visitors?|users?|customers?)\s+(?:can|should|may)\s+upload(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Click-to-enlarge image gallery / lightbox. Inherits the image-gallery
    // tokens that used to live on `carousel`, so "ett bildgalleri där man kan
    // förstora bilder" reaches the lightbox dossier instead of a swipe slider.
    capability: "gallery-lightbox",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:lightbox|bild[-\s]?galleri|bildgalleri|foto[-\s]?galleri|fotogalleri|photo[-\s]?(?:wall|gallery)|image[-\s]?gallery|product[-\s]?gallery)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:förstora\s+bilder(?:na)?|zooma\s+(?:in\s+)?(?:på\s+)?bilder(?:na)?|klickbara\s+bilder|klicka\s+för\s+att\s+förstora)(?![\p{L}\p{N}_])/iu,
    ],
    // Codex P2: a gallery with a carousel/slider/swipe cue should route to
    // `carousel`, not the click-to-enlarge lightbox. Suppress on slider cues.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:carousel|karusell|slider|slideshow|swipe|swipa|bildspel|auto-?play|autoplay)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Client-side dashboard chart primitives (VisActor wrapper + chart card).
    // Distinct from `analytics` (visitor tracking) and `stats-counter` (animated
    // KPI number band) — this is for actual data charts/graphs on the page.
    capability: "dashboard-charts",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:dashboard(?:-?(?:sida|page|sektion|section|vy|view))?|kpi-?dashboard|analytics-?dashboard|admin-?dashboard|instrumentpanel(?:en)?)(?![\p{L}\p{N}_])/iu,
      // Bugbot (PR #422): the bare chart/diagram/graf nouns exclude a trailing
      // size adjective so a refine like "gör diagrammet större" stays a tweak
      // (same guard class as the cta-section "gör CTA större" fix). Codex P2
      // round 2: the guard also skips an intensity adverb ("gör diagrammet
      // MYCKET större" / "make the chart WAY bigger"). "chart" also refuses a
      // ".js"/" js"/"-js" suffix so Chart.js (any spelling) routes via the
      // library veto below instead of matching as a chart-section noun.
      /(?<![\p{L}\p{N}_])(?:charts?(?![-.\s]?js(?![\p{L}\p{N}_]))|diagram(?:men|met)?|graf(?:er|erna|en)?|linjediagram|stapeldiagram|cirkeldiagram|line-?charts?|bar-?charts?|pie-?charts?|area-?charts?|sparklines?)(?![\p{L}\p{N}_])(?!\s+(?:mycket\s+|lite\s+(?:grann\s+)?|något\s+|betydligt\s+|rejält\s+|väldigt\s+|aningen\s+|much\s+|way\s+|slightly\s+|a\s+(?:bit|little)\s+)?(?:större|mindre|bredare|smalare|högre|lägre|tjockare|snyggare|bigger|smaller|larger|wider|taller))/iu,
      /(?<![\p{L}\p{N}_])(?:visualisera\s+(?:data|siffror|statistik)|data-?visualisering|data-?visualization)(?![\p{L}\p{N}_])/iu,
    ],
    // Flow/org diagrams are structural drawings, not data charts. Analytics
    // provider requests route to `analytics`, not a chart section. An explicit
    // chart-library name (Chart.js, Recharts, …) means the user has chosen a
    // stack — injecting the VisActor dossier would fight that choice.
    vetoes: [
      // Codex/VADE P2 (PR #422): also cover the space-separated English forms
      // ("flow chart", "org chart", "organizational chart"), which the bare
      // `chart` noun would otherwise match.
      /(?<![\p{L}\p{N}_])(?:flow[-\s]?charts?|flödesschema(?:t)?|org[-\s]?charts?|organi[sz]ations?[-\s]?charts?|organi[sz]ational[-\s]?charts?|organisationsschema(?:t)?)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:plausible|google[-\s]?analytics|posthog|mixpanel|fathom|matomo|statcounter|vercel[-\s]?analytics)(?![\p{L}\p{N}_])/iu,
      // Codex P2 round 2: cover spaced/hyphenated Chart.js spellings too
      // ("chart js", "chart-js") — the bare noun guard alone must not be the
      // only thing standing between an explicit library choice and VisActor.
      /(?<![\p{L}\p{N}_])(?:chart[-.\s]?js|react-?chartjs(?:-2)?|recharts|highcharts|apexcharts|plotly|nivo|d3(?:\.js)?)(?![\p{L}\p{N}_])/iu,
    ],
  },
  // `cms` left the vocabulary 2026-09-02 with the parked sanity-cms dossier
  // (sole provider). A capability without a backing dossier selects nothing,
  // so detecting it would only mute a freehand-able content surface.
];
