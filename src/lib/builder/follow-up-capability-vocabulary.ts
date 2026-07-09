/**
 * Capability vocabulary for follow-up detection.
 *
 * Source-of-truth for the set of capability ids: `data/dossiers/_index/capability-map.json`.
 * The keys here MUST match those ids verbatim — they are forwarded to
 * `selectDossiersForRequest` which looks dossiers up by capability. Not every
 * capability in the map needs an entry here: `physics-3d` arrives via the
 * inferred-capability bridge. The capability count is intentionally NOT stated
 * here — it drifts; `follow-up-capability-vocabulary.test.ts` guards every
 * entry's id against the map instead.
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
  /** Must match a capability id in `data/dossiers/_index/capability-map.json`. */
  capability: string;
  /** At least one pattern must match the message for the capability to detect. */
  patterns: RegExp[];
  /** Optional veto patterns; if any matches, the capability is suppressed. */
  vetoes?: RegExp[];
}

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
  {
    capability: "parallax-pointer",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:pointer-?parallax|mus-?parallax|mouse-?parallax|cursor-?parallax)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:följer\s+(?:musen|muspekaren|cursor|pointer)|hover-?tilt|tilt-?card)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "parallax-scroll",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:scroll-?parallax|scroll-?driven|sticky-?parallax|pinned-?(?:section|parallax))(?![\p{L}\p{N}_])/iu,
      // Generic "parallax" without explicit pointer/scroll cue → defaults
      // to scroll-parallax. Pointer keyword comes first in vocabulary so
      // pointer-specific phrases are detected first; this fallback only
      // fires on the bare word.
      /(?<![\p{L}\p{N}_])(?:parallax|paralaks|parallax-?effekt|parallax-?header)(?![\p{L}\p{N}_])/iu,
    ],
    // If the prompt names a pointer/mouse/cursor variant the user wants
    // pointer-parallax — emitting both would lead to two dossiers being
    // injected and a noisier capability-pack. Veto suppresses the generic
    // scroll fallback in those cases.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:pointer-?parallax|mus-?parallax|mouse-?parallax|cursor-?parallax)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:följer\s+(?:musen|muspekaren|cursor|pointer)|hover-?tilt|tilt-?card)(?![\p{L}\p{N}_])/iu,
    ],
  },
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
      // Recurring terms (subscription-billing / recurring-billing /
      // prenumerationsbetalning) were MOVED to the `subscriptions` entry below
      // (bugbot high on the dossier-batch PR): keeping them here made a
      // recurring ask match BOTH capabilities and collide stripe-checkout with
      // paddle-billing. One-off payment vocabulary only.
      /(?<![\p{L}\p{N}_])(?:betalningsfl(?:ö|o)de|betalningsl(?:ö|o)sning|payment[-\s]?flow|checkout[-\s]?flow)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])betala\s+med\s+(?:kort|kreditkort|swish|klarna|stripe|paypal|visa|mastercard|apple\s*pay|google\s*pay)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])k(?:ö|o)p(?:a)?\s+med\s+(?:kort|kreditkort|stripe|klarna|swish|checkout)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Recurring subscriptions / memberships (Paddle Billing). INTENTIONALLY
    // separate from one-off `payments` (Stripe-checkout owns `payments`): this
    // capability is for recurring plans/memberships synced from signed Paddle
    // webhooks. The provider word "paddle" is high-precision. Vetoes keep it off
    // one-off payment intent and newsletter "prenumerera på nyhetsbrev".
    capability: "subscriptions",
    patterns: [
      /(?<![\p{L}\p{N}_])paddle(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:prenumeration(?:en|er|erna|s)?|prenumerera(?:r|s)?|prenumerationstj(?:ä|a)nst(?:en)?|prenumerationsplan(?:en|er)?|abonnemang(?:et|en)?|subscription(?:s)?|subscribe)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:medlemskap(?:et|en)?|membership|members?[-\s]?(?:only|area|tier))(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:(?:å|a)terkommande\s+(?:betalning(?:ar|en)?|debitering(?:ar|en)?)|recurring\s+(?:payment(?:s)?|billing|subscription(?:s)?)|subscription[-\s]?billing|prenumerationsbetalning)(?![\p{L}\p{N}_])/iu,
    ],
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:eng(?:å|a)ngs(?:betalning(?:ar|en)?|k(?:ö|o)p(?:et)?|belopp)?|one-?time|one-?off|single\s+payment)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:nyhetsbrev(?:et)?|newsletter)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Supabase Auth (SSR) — an EXPLICIT-Supabase-intent capability. Listed
    // BEFORE `auth` (clerk-auth) so a Supabase-specific ask wins the more
    // specific capability, exactly like ai-tool-calling before ai-chat. The
    // patterns REQUIRE the word "supabase" adjacent to an auth cue (or a
    // "<auth cue> med/with/via supabase" phrasing), so a generic
    // "login/inloggning/auth" with no Supabase mention never reaches here — it
    // stays `auth` → clerk-auth. Selection must NOT let this compete with the
    // generic `auth` default; the `auth` entry below vetoes these same phrases.
    capability: "supabase-auth",
    patterns: [
      /(?<![\p{L}\p{N}_])supabase[-\s]?(?:auth(?:entication)?|autentisering|login|log[-\s]?in|logga\s+in|inloggning|sign[-\s]?in|sign[-\s]?up|sso|magic[-\s]?link)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:auth(?:entication)?|autentisering|login|log[-\s]?in|logga\s+in|inloggning|sign[-\s]?in|sign[-\s]?up)\s+(?:med|with|via|using)\s+supabase(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "auth",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:auth|inloggning|registrera\s+konto|logga\s+in|sign[-\s]?in|sign[-\s]?up|register|clerk|next-?auth|auth\.js)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:lösenord|password|forgot[-\s]?password|reset[-\s]?password|återställ\s+lösenord)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:oauth|jwt|magic\s+link|session\.(?:store|cookie|token))(?![\p{L}\p{N}_])/iu,
    ],
    // Explicit Supabase-auth intent routes to the `supabase-auth` capability
    // above, NOT clerk-auth. Without this veto "supabase auth" /
    // "supabase-inloggning" would ALSO fire the generic `auth` capability and
    // inject clerk-auth alongside supabase-auth. Mirrors the ai-chat veto on
    // tool-calling. Generic "login/inloggning/auth" (no "supabase") does not
    // match here, so it still routes to `auth` → clerk-auth.
    vetoes: [
      /(?<![\p{L}\p{N}_])supabase[-\s]?(?:auth(?:entication)?|autentisering|login|log[-\s]?in|logga\s+in|inloggning|sign[-\s]?in|sign[-\s]?up|sso|magic[-\s]?link)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:auth(?:entication)?|autentisering|login|log[-\s]?in|logga\s+in|inloggning|sign[-\s]?in|sign[-\s]?up)\s+(?:med|with|via|using)\s+supabase(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Retrieval-augmented chat over the site's OWN indexed content (pgvector).
    // Listed BEFORE `ai-tool-calling`/`ai-chat` so an explicit RAG ask wins the
    // most specific capability. Every pattern requires an explicit retrieval
    // cue — "rag", "kunskapsbas-chat", "chat med egna dokument", "svarar från
    // våra dokument", a vector-store noun — NEVER bare "chatbot"/"ai-chat"
    // (openai-chat owns generic chatbots; see the matching veto on `ai-chat`).
    capability: "rag-chat",
    patterns: [
      // The RAG term family itself (tech word, high signal in any language).
      /(?<![\p{L}\p{N}_])(?:rag|rag-?chat|rag-?bot|retrieval-?augmented(?:\s+generation)?)(?![\p{L}\p{N}_])/iu,
      // Vector-store nouns — the `database` capability vetoes these on purpose
      // (see its veto comment) so they must land here instead.
      /(?<![\p{L}\p{N}_])(?:pgvector|(?:vector|vektor)[-\s]?(?:databas(?:en)?|database|db|store|search)|semantisk\s+sökning|semantic\s+search)(?![\p{L}\p{N}_])/iu,
      // Knowledge-base chat compounds, Swedish + English.
      /(?<![\p{L}\p{N}_])(?:kunskapsbas(?:en)?[-\s]?(?:chat|chatt|bot|assistent)|knowledge[-\s]?base\s+(?:chat|bot|assistant)|chatt?a?\s+(?:med|mot)\s+(?:vår\s+|er\s+)?kunskapsbas(?:en)?)(?![\p{L}\p{N}_])/iu,
      // "Chat with our documents" phrasing.
      /(?<![\p{L}\p{N}_])(?:chatt?a?\s+med\s+(?:våra|egna|era|sina|dina)\s+(?:dokument|filer|pdf:?er)|chat\s+with\s+(?:our|your)\s+(?:docs|documents|files))(?![\p{L}\p{N}_])/iu,
      // Document Q&A.
      /(?<![\p{L}\p{N}_])(?:dokument|document)[-\s]?q\s*&\s*a(?![\p{L}\p{N}_])/iu,
      // "chatbot/assistant that answers FROM our documents/content/knowledge
      // base" — the retrieval clause is what separates this from `ai-chat`.
      /(?<![\p{L}\p{N}_])(?:chatt?bot|assistent(?:en)?|assistant|ai)[\s\S]{0,60}(?:som\s+svarar\s+(?:utifrån|från|ur|baserat\s+på)|that\s+answers\s+(?:from|based\s+on)|answering\s+from)\s+(?:våra|vara|egna|era|sina|dina|our|your|the\s+site'?s?)?\s*(?:dokument|innehåll|kunskapsbas(?:en)?|artiklar|filer|documents?|docs|content|knowledge)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // AI assistant that executes server-side tools (function-calling roundtrips).
    // Listed BEFORE `ai-chat` so a tool-calling ask wins the more specific
    // capability; a plain conversational chatbot stays `ai-chat`. Requires an
    // explicit tool/function/action cue — "ai-chat som kan söka i våra dokument"
    // style phrasing — never bare "chatbot".
    capability: "ai-tool-calling",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:tool-?calling|tool-?call(?:s|er)?|function-?calling|verktygsanrop|funktionsanrop|tool-?roundtrips?)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:ai|llm|chatt?bot|assistent(?:en)?|assistant)[\s\S]{0,60}(?:använd(?:er|a|e)?\s+verktyg|anropa(?:r)?\s+(?:verktyg|funktioner|api:?er)|call(?:s|ing)?\s+tools|uses?\s+tools|execute(?:s)?\s+tools|kör(?:a)?\s+verktyg)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:agent(?:isk)?\s+(?:chat|chatt|assistent|assistant)|ai-?agent\s+som\s+(?:kan\s+)?(?:utför|bokar|söker|hämtar|slår\s+upp))(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:assistent|assistant|chatt?bot|ai)[\s\S]{0,80}(?:som\s+kan\s+(?:utföra|boka|slå\s+upp|hämta\s+(?:live|real)-?(?:data|tid))|that\s+can\s+(?:perform|execute|look\s+up|book|fetch\s+live))(?![\p{L}\p{N}_])/iu,
    ],
    // A plain conversational AI chat (no tool/action cue) must stay `ai-chat`;
    // these vetoes keep the generic chat vocabulary from being shadowed when
    // the user explicitly says "vanlig chatbot" / "simple chatbot".
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:vanlig|enkel|simpel|basic|simple|plain)\s+(?:ai-?)?(?:chatt?bot|chatt|chat|assistent|assistant)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "ai-chat",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:ai-?chatt|ai-?chat|chattbot|chatbot|ai-?assistent|ai-?bot|llm-?chat|chat[-\s]?ui|chat[-\s]?widget)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:openai\s+chat|gpt-?chat|claude-?chat|chatgpt-?widget)(?![\p{L}\p{N}_])/iu,
    ],
    // `openai-chat`, `ai-tool-calling-chat` AND `rag-chat` all ship an
    // `/api/chat`-style route — injecting two of them would collide. When the
    // prompt carries an explicit tool/function-calling cue the more specific
    // `ai-tool-calling` entry above wins; when it carries an explicit
    // retrieval/RAG cue the `rag-chat` entry wins. Either way this generic
    // chat entry is suppressed (parallax-pointer/scroll precedent). Bare
    // "chatbot" with no cue stays here.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:tool-?calling|tool-?call(?:s|er)?|function-?calling|verktygsanrop|funktionsanrop|tool-?roundtrips?)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:använd(?:er|a|e)?\s+verktyg|anropa(?:r)?\s+(?:verktyg|funktioner)|call(?:s|ing)?\s+tools|uses?\s+tools|execute(?:s)?\s+tools|kör(?:a)?\s+verktyg)(?![\p{L}\p{N}_])/iu,
      // RAG cues — mirror the `rag-chat` trigger families above.
      /(?<![\p{L}\p{N}_])(?:rag|rag-?chat|rag-?bot|retrieval-?augmented(?:\s+generation)?|pgvector|kunskapsbas(?:en)?[-\s]?(?:chat|chatt|bot|assistent)|knowledge[-\s]?base\s+(?:chat|bot|assistant)|(?:dokument|document)[-\s]?q\s*&\s*a)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:som\s+svarar\s+(?:utifrån|från|ur|baserat\s+på)|that\s+answers\s+(?:from|based\s+on)|answering\s+from)\s+(?:våra|vara|egna|era|sina|dina|our|your|the\s+site'?s?)?\s*(?:dokument|innehåll|kunskapsbas(?:en)?|artiklar|filer|documents?|docs|content|knowledge)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Realtime infrastructure (Ably pub/sub, presence, live updates between
    // clients). NOT "live-feeling" animations and NOT real-time analytics —
    // those route to `analytics` / ordinary page content.
    capability: "realtime",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:ably|pusher|websockets?|web-?sockets?|socket\.io|pub\/?sub|pubsub)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:realtids?-?(?:chat|chatt|meddelanden|notiser|uppdateringar|funktion(?:er)?)|real-?time\s+(?:chat|messaging|notifications?|updates?|collaboration))(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:live-?(?:chat|chatt)|presence|närvaro-?(?:status|indikator)|vem\s+som\s+är\s+online|collaborative\s+(?:editing|cursors?)|multiplayer)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:live-?(?:notiser|notifikationer|uppdateringar)|live\s+(?:notifications?|updates?))(?![\p{L}\p{N}_])/iu,
    ],
    // "real-time analytics" / "realtidsstatistik" is an analytics/dashboard
    // ask, not realtime messaging infrastructure — those route to `analytics`
    // or `dashboard-charts`, never the Ably dossier. Swedish definite forms
    // (dashboarden, statistiken) are covered so inflection can't dodge the veto.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:real-?time|realtids?)[-\s]?(?:analytics|analys(?:en)?|statistik(?:en)?|dashboard(?:s|en|erna)?|rapporter(?:ing(?:en)?)?|metrics)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Server-side AI text-to-image generation (Fal). NOT image galleries,
    // lightboxes, carousels or stock imagery — the site must GENERATE images.
    capability: "image-generation",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:text-?(?:till|to)-?(?:bild|image)|ai-?(?:bild|image)-?(?:generator|generering|generation)|image-?generation|bildgenerering|bildgenerator)(?![\p{L}\p{N}_])/iu,
      // Visitor-facing generation ("användare kan generera bilder") or an
      // explicit with-AI clause. Bare "generera bilder" is NOT enough — that
      // phrasing also covers asking Sajtmaskin for page imagery assets.
      /(?<![\p{L}\p{N}_])(?:användar(?:e|na)?|besökar(?:e|na)?|users?|visitors?|kunder(?:na)?)[\s\S]{0,50}(?:generera(?:r)?\s+bilder|generate\s+images?|skapa(?:r)?\s+bilder)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:generera(?:r)?|skapa(?:r)?)\s+bilder\s+(?:med|via)\s+ai(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])(?:generate|create)\s+images?\s+(?:with|using|via)\s+ai(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:fal(?:\.ai)?|flux(?:-?schnell|-?pro)?|dall-?e|stable\s+diffusion|midjourney)(?![\p{L}\p{N}_])/iu,
    ],
    // Gallery/lightbox/carousel asks are about SHOWING images, not generating
    // them — route those to their own capabilities. "AI-genererade bilder" as
    // page imagery (assets) is also not an in-site generator tool. Swedish
    // definite/plural inflections included so "bildgalleriet" can't dodge.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:bild-?galleri(?:et|er|erna)?|foto-?galleri(?:et|er|erna)?|image[-\s]?galler(?:y|ies)|photo[-\s]?galler(?:y|ies)|lightbox(?:en)?|karusell(?:en|er)?|carousel|bildspel(?:et)?|slideshow)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:stock-?(?:bilder|foton|photos?|images?)|hero-?(?:bild|image)|bakgrundsbild(?:er)?|background\s+images?)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Persistent server-side data storage (Postgres/Drizzle default;
    // mongodb-atlas / neon-postgres siblings resolve via manifest
    // relevanceKeywords in select.ts). NOT vector stores (those are
    // `rag-chat`) and NOT analytics/tracking — those route to `analytics`.
    capability: "database",
    patterns: [
      // Core nouns, Swedish + English inflections.
      /(?<![\p{L}\p{N}_])(?:databas(?:en|er|erna)?|databases?|sql[-\s]?databas(?:en)?|sql\s+database)(?![\p{L}\p{N}_])/iu,
      // Provider / stack names that unambiguously mean a database layer.
      // Bare "neon" is intentionally NOT matched — it is a common design word
      // (neonfärger, neon-skyltar); Neon-the-provider needs a DB-flavoured
      // compound or the neon.tech domain.
      /(?<![\p{L}\p{N}_])(?:postgres(?:ql)?|drizzle(?:-?orm)?|mongo(?:db)?(?:[-\s]?atlas)?|neon[-\s]?(?:postgres(?:ql)?|db|databas(?:en)?|database)|neon\.tech)(?![\p{L}\p{N}_])/iu,
      // Verb phrases: "lagra/spara ... i (en) databas", "store/save ... in a database".
      /(?<![\p{L}\p{N}_])(?:lagra(?:r|de)?|spara(?:r|de)?|persistera(?:r|de)?)[\s\S]{0,60}i\s+(?:en\s+)?databas(?:en)?(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:store|save|persist)[\s\S]{0,60}(?:in|to)\s+(?:a\s+|the\s+)?database(?![\p{L}\p{N}_])/iu,
    ],
    // Vetoes:
    //  - Vector stores are the `rag-chat` capability, not this dossier.
    //  - Analytics/tracking asks route to `analytics` — "spåra besökare i en
    //    databas" is a visitor-tracking request, not a persistence layer.
    //  - An explicit competing ORM/BaaS choice (Prisma, Mongoose, Supabase,
    //    Firebase, …) must not pull in the Drizzle/Mongo-driver stack — same
    //    precedent as the Chart.js veto on `dashboard-charts`.
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
    capability: "newsletter-subscribe",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:nyhetsbrev|newsletter|prenumerera\s+på\s+nyhetsbrev|subscribe[-\s]?form|email[-\s]?signup|mailchimp|brevo|mailerlite)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "analytics",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:analytics|webbanalys|webb-?analys|plausible|vercel[-\s]?analytics|google[-\s]?analytics|posthog|mixpanel|fathom)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:spåra\s+besökare|track[-\s]?visitors|page[-\s]?views|sidvisningar)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "error-tracking",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:sentry|error[-\s]?tracking|fel-?spårning|crash[-\s]?reporting|bug[-\s]?reporting|datadog|bugsnag|rollbar)(?![\p{L}\p{N}_])/iu,
    ],
  },
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
    capability: "command-search",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:command[-\s]?palette|kommandopalett|cmd[-\s]?k|cmdk|spotlight[-\s]?search|sökpalett|quick[-\s]?search|command[-\s]?menu)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "faq-section",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:faq|faq-?sektion|faq-?accordion|vanliga\s+frågor|frågor\s+och\s+svar|q\s*&\s*a)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "marquee",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:marquee|löpande\s+text|löptext|ticker|logo[-\s]?marquee|brand[-\s]?marquee|scrolling[-\s]?logos|scrolling\s+\p{L}+\s+logos|rullande\s+loggor|scrollande\s+loggor)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "pricing-section",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:pricing[-\s]?section|pristabell|prisplan|prisplaner|pris-?sektion|prissektion|pricing[-\s]?table|pricing[-\s]?tier|tier[-\s]?table|prisniv(?:å|aer))(?![\p{L}\p{N}_])/iu,
    ],
    // "pris" alone is too broad ("priserna i menyn") — pristabell/prisplan
    // forms above are explicit enough that we don't need a veto.
  },
  {
    capability: "testimonials-section",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:testimonials?|testimonials[-\s]?section|testimonial[-\s]?grid|kundomdömen|kundutlåtanden|recensioner-?sektion|kundröster|reviews[-\s]?section)(?![\p{L}\p{N}_])/iu,
    ],
  },
  // ── #242 section capabilities ─────────────────────────────────────────────
  {
    // Static "trusted by" / customer-logo grid. NOT the scrolling logo
    // marquee (that is `marquee`: logo-marquee / scrolling-logos). Requires a
    // plural-logos or explicit logo-cloud cue so a single "vår logga" (header
    // logo / favicon) does not false-trigger.
    capability: "logo-cloud",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:logo[-\s]?cloud|logo[-\s]?wall|logo[-\s]?rad|logorad|kund[-\s]?loggor|kundloggor|partner[-\s]?loggor|partnerloggor|brand[-\s]?logos|company[-\s]?logos|customer[-\s]?logos|client[-\s]?logos|partner[-\s]?logos|logos?[-\s]?(?:strip|grid|bar|wall))(?![\p{L}\p{N}_])/iu,
      // English logo-cloud headers (unambiguous).
      /(?<![\p{L}\p{N}_])(?:trusted[-\s]?by|as[-\s]?seen[-\s]?in)(?![\p{L}\p{N}_])/iu,
      // Codex P2: the bare Swedish "används av" / "som syns i" were dropped —
      // they matched ordinary relative clauses ("en knapp som syns i menyn",
      // "en regel som används av admins"). This variant requires an explicit
      // logo / brand / partner / media cue after the phrase.
      /(?<![\p{L}\p{N}_])(?:som\s+syns\s+i|används\s+av|anlitas\s+av)\s+(?:\p{L}+\s+){0,2}(?:loggor|logotyper|varumärken|partner(?:s|loggor)?|medier|media|press|tidningar|magasin)(?![\p{L}\p{N}_])/iu,
    ],
    // Codex P2: a scrolling/marquee logo request belongs to `marquee` (the
    // logo-cloud dossier is an explicitly static grid). Suppress on scroll cues.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:scroll(?:ing|ande)?|scrolla(?:r|nde)?|rullande|löpande|marquee|ticker|auto-?scroll)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Animated KPI / metrics band ("nyckeltal", "siffror som räknar upp").
    // Distinct from `analytics` (visitor tracking) — this is a visual number
    // band, not an analytics integration. Bare "statistik" is intentionally
    // NOT matched (too close to analytics); the band/section forms are.
    capability: "stats-counter",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:stats?[-\s]?counter|stat[-\s]?counter|stats?[-\s]?row|count[-\s]?up|räkneverk|nyckeltal|by[-\s]?the[-\s]?numbers|numbers[-\s]?strip|siffer(?:rad|band)|metrics?[-\s]?(?:band|counter|section|row)|statistik[-\s]?(?:band|sektion|sektionen))(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:animated[-\s]?(?:numbers|counters?)|siffror\s+som\s+(?:räknar|tickar)|räknande\s+siffror)(?![\p{L}\p{N}_])/iu,
    ],
    // Codex P2: "StatCounter" is an analytics provider, not a visual KPI band.
    // Veto the provider name and any analytics/tracking context so e.g.
    // "koppla på StatCounter" routes as analytics, not a stats-counter section.
    vetoes: [
      /(?<![\p{L}\p{N}_])statcounter(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:analytics|webbanalys|webb-?analys|tracking|spårning|spåra\s+besökare|besökarstatistik|plausible|google[-\s]?analytics|posthog|mixpanel|fathom|matomo)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Feature / service card grid. Requires a grid/cards/section qualifier so
    // bare "feature" (common in marketing copy) does not false-trigger.
    capability: "feature-grid",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:features?[-\s]?(?:grid|cards?|section)|services?[-\s]?(?:grid|cards?|section)|funktions?[-\s]?(?:kort|rutor|grid)|funktionskort|tjänste[-\s]?kort|tjänstekort|kort[-\s]?grid|kortgrid)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    // Call-to-action band. Bare "cta" is high-signal, but Codex P2 flagged that
    // "gör CTA-knappen större" (a single-button tweak) injected the section
    // dossier because "gör" satisfies the add-verb gate. So bare "cta" now
    // excludes "cta-knapp"/"cta button"; the explicit section/band/banner forms
    // still match. The add-verb gate still suppresses "Flytta CTA-knappen ...".
    capability: "cta-section",
    patterns: [
      /(?<![\p{L}\p{N}_])cta(?![\p{L}\p{N}_])(?![-\s]?(?:knapp|button|btn))(?!\s+(?:större|mindre|bredare|smalare|tjockare|rundare|fetare))/iu,
      /(?<![\p{L}\p{N}_])(?:call[-\s]?to[-\s]?action|uppmaning\s+till\s+handling|avslutande\s+cta|boknings[-\s]?cta|cta[-\s]?(?:section|sektion|sektionen|band|banner|block))(?![\p{L}\p{N}_])/iu,
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
    // Multi-step form / wizard / progress stepper.
    capability: "stepper",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:stepper|wizard|multi[-\s]?step|flerstegs(?:formulär)?|flerstegsformulär|steg-?för-?steg|progress[-\s]?(?:stepper|indicator|steps)|stegindikator)(?![\p{L}\p{N}_])/iu,
      // Codex P2: bare "flera steg" matched "gör knappen flera steg större".
      // Only match it when tied to a form / wizard / process flow.
      /(?<![\p{L}\p{N}_])(?:(?:formulär(?:et)?|form|process(?:en)?|flöde[t]?|checkout|onboarding|registrering(?:en)?|guide(?:n)?|wizard|anmälan|ansökan)\s+(?:i|med|på|över|till)?\s*flera\s+steg|flera\s+steg(?:s)?\s+(?:formulär|form|process|flöde|guide|wizard|onboarding|registrering))(?![\p{L}\p{N}_])/iu,
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
  {
    // Headless CMS integration (sanity-cms is the capability default). The
    // ask is "content editable WITHOUT code" — a named CMS, Sanity, Swedish
    // "innehållshantering", or an editors-can-update-it-themselves phrasing.
    // NOT ordinary page-content edits ("ändra innehållet i heron" is a
    // refine, guarded by the add-verb gate + the phrase patterns requiring an
    // utan-kod/själv tail), and NOT "the site has a blog" on its own.
    capability: "cms",
    patterns: [
      // High-signal acronym / compound asks.
      /(?<![\p{L}\p{N}_])(?:headless[-\s]?cms|cms)(?![\p{L}\p{N}_])/iu,
      // Sanity-the-provider. "sanity check" is an ordinary English phrase —
      // the trailing lookahead refuses the check(s) continuation.
      /(?<![\p{L}\p{N}_])sanity(?:\.io)?(?![\p{L}\p{N}_])(?![-\s]?checks?)/iu,
      /(?<![\p{L}\p{N}_])(?:innehållshantering(?:en|ssystem(?:et)?)?|content[-\s]?management(?:[-\s]?system)?)(?![\p{L}\p{N}_])/iu,
      // "redigera/uppdatera innehållet utan kod / själva" — the tail is
      // required so a plain content tweak never routes here.
      /(?<![\p{L}\p{N}_])(?:redigera|uppdatera|hantera|ändra)\s+(?:sitt\s+|sajtens\s+|webbplatsens\s+)?innehåll(?:et)?\s+(?:utan\s+(?:kod|utvecklare|programmering)|själv(?:a)?)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:edit|manage|update)\s+(?:the\s+|their\s+|site\s+)?content\s+(?:without\s+(?:code|coding|a\s+developer)|themselves)(?![\p{L}\p{N}_])/iu,
      // Editors/staff as the acting persona.
      /(?<![\p{L}\p{N}_])redaktör(?:er|en|erna)?[\s\S]{0,60}(?:redigera|uppdatera|ändra|publicera|hantera)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])editors?\s+(?:can|should)\s+(?:edit|update|manage|publish)(?![\p{L}\p{N}_])/iu,
    ],
    // An explicit competing CMS choice must not pull in the Sanity dossier
    // (Chart.js precedent on dashboard-charts). Kept to actual CMS products;
    // generic site-builder names are a different ask and stay unlisted.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:wordpress|contentful|strapi|prismic|storyblok|datocms|payload[-\s]?cms|craft[-\s]?cms|ghost[-\s]?cms|butter[-\s]?cms|sitecore|umbraco|drupal|joomla|keystone(?:js)?|directus)(?![\p{L}\p{N}_])/iu,
    ],
  },
];
