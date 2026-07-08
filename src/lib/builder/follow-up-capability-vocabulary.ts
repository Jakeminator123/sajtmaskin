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
      /(?<![\p{L}\p{N}_])(?:betalningsfl(?:ö|o)de|betalningsl(?:ö|o)sning|payment[-\s]?flow|checkout[-\s]?flow|subscription[-\s]?billing|recurring[-\s]?billing|prenumerationsbetalning)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])betala\s+med\s+(?:kort|kreditkort|swish|klarna|stripe|paypal|visa|mastercard|apple\s*pay|google\s*pay)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])k(?:ö|o)p(?:a)?\s+med\s+(?:kort|kreditkort|stripe|klarna|swish|checkout)(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "auth",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:auth|inloggning|registrera\s+konto|logga\s+in|sign[-\s]?in|sign[-\s]?up|register|clerk|next-?auth|auth\.js)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:lösenord|password|forgot[-\s]?password|reset[-\s]?password|återställ\s+lösenord)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:oauth|jwt|magic\s+link|session\.(?:store|cookie|token))(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    capability: "ai-chat",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:ai-?chatt|ai-?chat|chattbot|chatbot|ai-?assistent|ai-?bot|llm-?chat|chat[-\s]?ui|chat[-\s]?widget)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:openai\s+chat|gpt-?chat|claude-?chat|chatgpt-?widget)(?![\p{L}\p{N}_])/iu,
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
      // (same guard class as the cta-section "gör CTA större" fix). "chart"
      // also refuses a ".js"/"js" suffix so Chart.js routes via the library
      // veto below instead of matching as a chart-section noun.
      /(?<![\p{L}\p{N}_])(?:charts?(?!\.?js)|diagram(?:men|met)?|graf(?:er|erna|en)?|linjediagram|stapeldiagram|cirkeldiagram|line-?charts?|bar-?charts?|pie-?charts?|area-?charts?|sparklines?)(?![\p{L}\p{N}_])(?!\s+(?:större|mindre|bredare|smalare|högre|lägre|tjockare|snyggare|bigger|smaller|larger|wider|taller))/iu,
      /(?<![\p{L}\p{N}_])(?:visualisera\s+(?:data|siffror|statistik)|data-?visualisering|data-?visualization)(?![\p{L}\p{N}_])/iu,
    ],
    // Flow/org diagrams are structural drawings, not data charts. Analytics
    // provider requests route to `analytics`, not a chart section. An explicit
    // chart-library name (Chart.js, Recharts, …) means the user has chosen a
    // stack — injecting the VisActor dossier would fight that choice.
    vetoes: [
      /(?<![\p{L}\p{N}_])(?:flow-?charts?|flödesschema(?:t)?|org-?charts?|organisationsschema(?:t)?)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:plausible|google[-\s]?analytics|posthog|mixpanel|fathom|matomo|statcounter|vercel[-\s]?analytics)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])(?:chart\.?js|react-?chartjs(?:-2)?|recharts|highcharts|apexcharts|plotly|nivo|d3(?:\.js)?)(?![\p{L}\p{N}_])/iu,
    ],
  },
];
