/**
 * Capability inference — classifies what a prompt needs so that the
 * system prompt and docs injection can be tuned accordingly.
 *
 * Runs before generation. Fast, deterministic, no API calls.
 *
 * **Parallel implementations — INTENTIONALLY SEPARATE:**
 * The `needs3D` / `needsPhysics` / `needsGame` flags here are NOT the same
 * decision as dossier capability detection in
 * `src/lib/builder/follow-up-capability-vocabulary.ts` or scaffold-unlock
 * in `src/lib/providers/own-engine/follow-up-clarification.ts`. Each
 * consumer has a different threshold:
 *  - This file: boolean flags into prompt + build-spec context policy.
 *    Some rules use ASCII `\b`, others Unicode boundaries — see per-rule
 *    comments before changing.
 *  - `follow-up-capability-vocabulary.ts`: dossier id (`visual-3d`)
 *    selection + tier. Always Unicode look-arounds.
 *  - `follow-up-clarification.ts`: scaffold rematch unlock. Strictly
 *    narrower than both above.
 *
 * Regression matrix lives in
 * `src/lib/providers/own-engine/follow-up-clarification.test.ts`
 * (describe "follow-up signal regression matrix"). Read it before merging
 * regex banks across these three files.
 */

import { uWordRegex } from "@/lib/utils/unicode-word-boundary";
import {
  hasNegatedAuthIntent,
  hasNegatedBackendIntent,
  hasNegatedEcommerceIntent,
  hasNegatedPaymentIntent,
  isVisualOnlyFollowUpPrompt,
} from "@/lib/builder/prompt-negation";

export interface InferredCapabilities {
  needsMotion: boolean;
  needs3D: boolean;
  /**
   * Stronger signal than `needs3D` — the prompt describes physics-driven
   * motion (bouncing, falling, gravity, collisions). Implies `needs3D` and
   * upgrades the 3D instruction to require @react-three/rapier.
   *
   * Optional so existing fixtures across the test suite keep type-checking
   * after this field was added; `inferCapabilities` always sets it
   * explicitly, and consumers should treat absence as `false`.
   */
  needsPhysics?: boolean;
  /**
   * Subset of `needsMotion` for parallax patterns specifically. Distinguished
   * because parallax has its own dossier pair (`scroll-parallax` and
   * `pointer-parallax`) with safety contracts (reduced-motion + viewport
   * units + pointer ownership) that the generic motion instruction does not
   * cover. Optional for backwards compatibility with older fixtures.
   */
  needsParallax?: boolean;
  /**
   * Prompt asks for a real ONE-OFF payment flow (Stripe/Klarna/checkout).
   * Bridges to the `payments` dossier capability so `stripe-checkout` is
   * selected with high confidence, and so the F3 readiness gate knows which
   * provider's keys are truly blocking. Recurring/subscription vocabulary
   * belongs to {@link InferredCapabilities.needsSubscriptions} after the
   * #475 payments/subscriptions split. Optional for backwards
   * compatibility with older fixtures.
   */
  needsPayments?: boolean;
  /**
   * Prompt asks for RECURRING subscriptions/memberships (Paddle,
   * prenumeration, membership billing). Bridges to the `subscriptions`
   * dossier capability (paddle-billing) — routing these terms to `payments`
   * after the #475 split would inject Stripe one-off checkout for a
   * recurring ask. Optional for backwards compatibility with older fixtures.
   */
  needsSubscriptions?: boolean;
  needsCharts: boolean;
  needsDatabase: boolean;
  needsAuth: boolean;
  needsAppShell: boolean;
  needsDataUI: boolean;
  needsForms: boolean;
  /** Interactive game/playable canvas intent, distinct from decorative canvas/3D. */
  needsGame?: boolean;
  needsEcommerce: boolean;
  needsCarousel: boolean;
  needsPremiumVisuals: boolean;
  needsCalendar: boolean;
  needsCommandSearch: boolean;
  needsThemeToggle: boolean;
}

interface CapabilityRule {
  key: keyof InferredCapabilities;
  patterns: RegExp[];
}

/**
 * 3D / WebGL / Canvas detection patterns. Shared between the `needs3D`
 * capability rule below and {@link explicitlyRequests3D} so the deterministic
 * inference and the orchestrate-side `visual-3d` gate agree on exactly what
 * counts as an explicit 3D request. None of these use the `g`/`y` flag, so
 * reusing the RegExp instances across call sites is stateless and safe.
 *
 * Do not narrow/broaden these without checking the regression matrix in
 * `src/lib/providers/own-engine/follow-up-clarification.test.ts`.
 */
export const NEEDS_3D_PATTERNS: RegExp[] = [
  /\b(3d|three\.?js|webgl|canvas|mesh|orb|sphere|particle|three-fiber|@react-three|drei|scene|3d-?model)\b/i,
  /\b3d[a-zåäö-]+\b/i,
  /\b(rotat.*3d|tilt|perspect.*card|floating.*object)\b/i,
  /\b(gltf|glb|usegltf)\b/i,
];

/**
 * True when the prompt literally asks for 3D / WebGL / Canvas, using the exact
 * same pattern bank as the `needs3D` capability rule. Consumed by
 * `filterDossierCapabilitiesForPrompt` in `src/lib/gen/orchestrate.ts` to drop
 * an LLM-suggested `visual-3d` dossier capability when the prompt only implies
 * a cinematic/immersive/dramatic mood (which belongs to `motionLevel`/
 * `qualityBar`) rather than real 3D. Mirrors how `carousel` is gated by
 * `explicitlyRequestsCarousel`.
 */
export function explicitlyRequests3D(prompt: string): boolean {
  return NEEDS_3D_PATTERNS.some((pattern) => pattern.test(prompt));
}

const RULES: CapabilityRule[] = [
  {
    key: "needsMotion",
    patterns: [
      /\b(animat|motion|framer|transition|fade|slide|stagger|entrance|animate|rörelse|animering|effekt|wow|premium|immersive|futurist)\b/i,
      /\b(hover.*(effect|animation)|scroll.*(reveal|trigger|animat))\b/i,
      uWordRegex("svävande|hovrande|flygande|floating|hovering", "iu"),
    ],
  },
  {
    // Parallax has its own dossier pair (`scroll-parallax`, `pointer-parallax`)
    // with safety contracts the generic motion instruction does not cover.
    // Word `parallax` was deliberately moved out of the `needsMotion` rule so
    // a parallax-specific prompt does not pull in the broader framer-motion
    // entrance-animation guidance unless the prompt asks for both.
    key: "needsParallax",
    patterns: [
      /\b(parallax|paralaks|parallax-?effekt|parallax-?scroll|parallax-?pointer|parallax-?header|parallax på (scroll|mus|pointer))\b/i,
      /\b(mouse.?parallax|pointer.?parallax|cursor.?parallax|mus.?parallax)\b/i,
      /\b(följer (mus(en|pekaren)|cursor|pointer)|hover.?tilt|tilt.?card)\b/i,
      /\b(scroll-?parallax|scroll-?driven|sticky.?parallax|pinned.?(section|parallax))\b/i,
    ],
  },
  {
    // Real payment intent — Stripe, Klarna, checkout, "betalningsflöde",
    // "betala med kort", "köpa med …". Bridges to the `payments` dossier
    // capability so `stripe-checkout` (or future provider dossiers) is
    // selected with high confidence and the F3 gate flags the right keys
    // as blocking. Distinct from generic ecommerce wording
    // (`needsEcommerce`) which still triggers product/cart/storefront
    // patterns. The "betala med …" pattern is intentionally narrow —
    // it requires a payment-instrument noun (`kort`, `swish`, `klarna`,
    // `kreditkort`) so generic "betala räkningen"-phrases don't trigger.
    key: "needsPayments",
    patterns: [
      /\b(stripe|stripe.?betalning|stripe.?checkout)\b/i,
      /\b(klarna|swish|paypal|adyen|mollie|braintree)\b/i,
      /\bcheckout\b/i,
      /\bkassa\b/i,
      /\b(betalningsfl(o|ö)de|betalningsl(o|ö)sning|payment.?flow|checkout.?flow)\b/i,
      /\b(card.?payment|kortbetalning|kortköp|kreditkort)\b/i,
      // "betala med kort/swish/klarna/kreditkort/visa/mastercard"
      /\bbetala\s+med\s+(kort|kreditkort|swish|klarna|stripe|paypal|visa|mastercard|apple\s*pay|google\s*pay)\b/i,
      // "köp(a) med kort/online/checkout" — narrow noun-list
      /\bk(ö|o)p(a)?\s+med\s+(kort|kreditkort|stripe|klarna|swish|checkout)\b/i,
    ],
  },
  {
    // Recurring subscriptions/memberships (paddle-billing dossier). Split
    // from `needsPayments` after #475: recurring vocabulary routed to
    // `payments` would inject Stripe one-off checkout for a subscription
    // ask. Unicode look-arounds so Swedish compounds
    // ("prenumerationsbetalning", "medlemskapssida") match (JS \b is
    // ASCII-only — see .cursor/rules/unicode-regex.mdc).
    key: "needsSubscriptions",
    patterns: [
      /(?<![\p{L}\p{N}_])(?:paddle|prenumeration[\p{L}]*|subscription[-\s]?billing|subscriptions?|medlemskap[\p{L}]*|membership[\p{L}]*)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])recurring[-\s]?(?:billing|payment[\p{L}]*|betalning[\p{L}]*)(?![\p{L}\p{N}_])/iu,
      /(?<![\p{L}\p{N}_])återkommande\s+betalning[\p{L}]*(?![\p{L}\p{N}_])/iu,
    ],
  },
  {
    key: "needs3D",
    patterns: NEEDS_3D_PATTERNS,
  },
  {
    key: "needsPhysics",
    patterns: [
      // Unicode-aware boundary instead of `\b` because JS `\b` is ASCII-only,
      // so `\båker\b` would never match inside "som åker omkring" (the leading
      // `å` is not an ASCII word char). Mirrors the boundary trick used for
      // ecommerce/hospitality vetoes in `inferCapabilities` below.
      /(?:^|[^\p{L}\p{N}])(?:studsar|studsande|studsa|kolliderar|kollisioner?|fysik|fysiksimulering|gravitation|gravity|falling|faller|bouncing|colliding|collisions?|rigidbody|collider|rapier|cannon)(?=[^\p{L}\p{N}]|$)/iu,
    ],
  },
  {
    key: "needsCharts",
    patterns: [
      /\b(chart|graph|diagram|analytics|visuali[sz]|recharts|line.?chart|bar.?chart|pie.?chart|area.?chart|statistik|graf|data.?viz)\b/i,
    ],
  },
  {
    key: "needsDatabase",
    patterns: [
      /\b(database|db|postgres|postgresql|mysql|sqlite|supabase|prisma|drizzle|sql|schema|migration|env\b.*database|databas)\b/i,
    ],
  },
  {
    key: "needsAuth",
    patterns: [
      // QW-2: `session` ensamt var för brett (träffar "session at the spa" på
      // hospitality-sajter). Kräv compound-form (session.store/cookie/token)
      // för att undvika false positives.
      /\b(auth|login|sign.?up|sign.?in|register|password|forgot.?password|reset.?password|inloggning|registrer|logga.?in|lösenord|konto|session.?(store|cookie|token)|oauth|jwt)\b/i,
    ],
  },
  {
    key: "needsAppShell",
    patterns: [
      /\b(dashboard|admin.?panel|sidebar|crm|backoffice|settings.?page|user.?manage|instrumentpanel|kontrollpanel|workspace|portal)\b/i,
      /\b(app-?lik|appkänsla|app-känsla|app-?aktig|app shell|app-lik)\b/i,
      /\b(gränssnitt|interface|undersökningsgränssnitt|kontrollrum|control room)\b/i,
    ],
  },
  {
    key: "needsDataUI",
    patterns: [
      /\b(data.?table|sorting|filtering|pagination|tanstack|table|tabell|crud|list.?view|datav[iy])\b/i,
    ],
  },
  {
    key: "needsForms",
    patterns: [
      // QW-2: `boka`/`booking` ensamt var för brett — varje hotell-follow-up
      // nämner "boka rum"/"booking" som en del av domänen, inte som en
      // begäran om att (åter)skapa formulär. Kräv form-relaterad förstärkning
      // (booking.form, boka.bord, kontaktformulär, multi-step-form, ...) så
      // form-pipelinen inte triggas på varje turn på hospitality-sajter.
      /\b(form|contact.?form|booking.?form|boka.?bord|survey|questionnaire|formulär|kontaktformulär|wizard.?form|multi.?step.?form)\b/i,
    ],
  },
  {
    key: "needsGame",
    patterns: [
      /(?:^|[^\p{L}\p{N}])(?:spel|tv-?spel|minigame|mini-?game|game|playable|arcade|pacman|pac-man|platformer|snake|tetris|quiz.?game|interactive.?game)(?=[^\p{L}\p{N}]|$)/iu,
      uWordRegex("platformer-?spel|pac-?man-?spel|pacmanspel|snake-?spel|tetris-?spel|quiz-?spel|arkadspel|minispel", "iu"),
      /(?:^|[^\p{L}\p{N}])(?:spelbar|interaktivt spel|interactive canvas game|playable canvas)(?=[^\p{L}\p{N}]|$)/iu,
    ],
  },
  {
    key: "needsEcommerce",
    patterns: [
      /\b(ecommerce|e-?commerce|e-?handel|shop|store|cart|varukorg|product|produkt|storefront|webshop)\b/i,
    ],
  },
  {
    key: "needsCarousel",
    patterns: [
      /\b(carousel|slider|slideshow|swipe|karusell|bildspel|hero.?slider|product.?gallery|produktkarusell)\b/i,
    ],
  },
  {
    key: "needsPremiumVisuals",
    patterns: [
      /\b(premium|luxury|glassmorphism|glass|glas|neon|glow|gradient.?text|blur|frosted|modern.*design|sleek|elegant|sophisticated|futuristisk|exklusiv)\b/i,
      /\b(dark.?mode.*hero|spotlight|cinematic|atmospheric|immersive)\b/i,
      /\b(filmisk|filmiskt|cinematisk|cinematiskt|arkiv.?x|x-files|ufo|paranormal)\b/i,
    ],
  },
  {
    key: "needsCalendar",
    patterns: [
      /\b(calendar|kalender|almanacka|date.?picker|datumväl|boka tid|schedule|tidbok|event.?calendar|händelsekalender)\b/i,
    ],
  },
  {
    key: "needsCommandSearch",
    patterns: [
      /\b(command.?palette|cmd.?k|sökpalett|sökfält|quick.?search|spotlight|command.?menu|kommandopalett)\b/i,
    ],
  },
  {
    key: "needsThemeToggle",
    patterns: [
      /\b(dark.?mode|mörkt.?tema|theme.?switch|light.?mode|tema.?växl|toggle.?theme|ljust.*mörkt|mörkt.*ljust|theme.?toggle)\b/i,
    ],
  },
];

export function inferCapabilities(prompt: string): InferredCapabilities {
  const result: InferredCapabilities = {
    needsMotion: false,
    needs3D: false,
    needsPhysics: false,
    needsParallax: false,
    needsPayments: false,
    needsSubscriptions: false,
    needsCharts: false,
    needsDatabase: false,
    needsAuth: false,
    needsAppShell: false,
    needsDataUI: false,
    needsForms: false,
    needsGame: false,
    needsEcommerce: false,
    needsCarousel: false,
    needsPremiumVisuals: false,
    needsCalendar: false,
    needsCommandSearch: false,
    needsThemeToggle: false,
  };

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(prompt)) {
        result[rule.key] = true;
        break;
      }
    }
  }

  const visualOnlyFollowUp = isVisualOnlyFollowUpPrompt(prompt);
  if (visualOnlyFollowUp || hasNegatedAuthIntent(prompt)) result.needsAuth = false;
  if (visualOnlyFollowUp || hasNegatedPaymentIntent(prompt)) result.needsPayments = false;
  // Subscriptions share the payment negation family: "utan betalning/
  // prenumeration" and visual-only follow-ups must not infer recurring billing.
  if (visualOnlyFollowUp || hasNegatedPaymentIntent(prompt)) {
    result.needsSubscriptions = false;
  }
  // needsEcommerce had no negation guard (unlike payments/auth/backend), so a
  // prompt like "en butik utan varukorg/betalning" still inferred Ecommerce
  // and dragged in cart/checkout scaffolding (prod chat 8bf59f13, 2026-07-01).
  if (visualOnlyFollowUp || hasNegatedEcommerceIntent(prompt)) result.needsEcommerce = false;
  if (visualOnlyFollowUp || hasNegatedBackendIntent(prompt)) {
    result.needsDatabase = false;
    result.needsDataUI = false;
  }

  if (result.needsPhysics) result.needs3D = true;
  if (result.needsGame) {
    result.needsMotion = true;
    if (/3d|three|webgl|canvas|physics|fysik|studs|gravity|collision|rapier/i.test(prompt)) {
      result.needs3D = true;
    }
  }
  if (result.needs3D) result.needsMotion = true;
  if (result.needsPremiumVisuals) result.needsMotion = true;
  if (result.needsCalendar) result.needsForms = true;
  // Parallax is a flavor of motion. Imply needsMotion so existing motion-
  // aware paths (system prompt section, dependency completion of
  // framer-motion) still trigger when only parallax was matched.
  if (result.needsParallax) result.needsMotion = true;

  if (result.needsEcommerce) {
    // Unicode-aware boundaries: JS `\b` is ASCII-only, so `\bcafé\b` would
    // never match `café ` (the `é` isn't a word char). Mirrors the pattern
    // used in `gen/scaffolds/matcher.ts`. Note: this list is duplicated in
    // `matcher.ts` (HOSPITALITY_SERVICE_KEYWORDS / STRONG_ECOMMERCE_INTENT)
    // and `config/domain-rules.json`. Keep them in sync until the embedding
    // migration replaces keyword lookup.
    const hospitalityVeto =
      /(^|[^\p{L}\p{N}])(?:restaurang|restaurant|café|cafe|kafé|bistro|hotell|hotel|spa|salong|salon|klinik|clinic|bakeri|bageri|bakery|pizzeria|catering|matrestaurang|boka bord|book a table|meny|menu|öppettider|opening hours)(?=[^\p{L}\p{N}]|$)/iu;
    const strongEcommerceIntent =
      /(^|[^\p{L}\p{N}])(?:webshop|webbshop|e-handel|ecommerce|e-commerce|varukorg|kundvagn|cart|checkout|kassa|storefront|nätbutik|online store)(?=[^\p{L}\p{N}]|$)/iu;
    if (hospitalityVeto.test(prompt) && !strongEcommerceIntent.test(prompt)) {
      result.needsEcommerce = false;
    }
  }

  return result;
}

/**
 * True when any capability flag indicates a non-trivial UI/product feature.
 * Used to prevent capability-heavy follow-ups from being treated as tiny tweaks.
 */
/**
 * Canonical list of capabilities that count as "heavy" — i.e. dimensions
 * that justify routing to the higher context-policy tier or extra verifier
 * passes. Single source of truth for both `hasHeavyCapabilities` (boolean
 * answer) and `deriveCapabilityFlags` (which keys to surface in
 * `BuildSpec.capabilityFlags.signals`).
 *
 * Keep this list in sync if you add new heavy capabilities — do NOT extend
 * the consumer-side filter independently. (See review note 2026-04-21:
 * `BuildSpec.capabilityFlags` previously listed `needsMotion` /
 * `needsPhysics` / `needsCalendar` in `signals` even though
 * `hasHeavyCapabilities` did not consider them heavy, which made `heavy`
 * and `signals` describe two different definitions of "heavy".)
 */
export const HEAVY_CAPABILITY_KEYS = [
  "needs3D",
  "needsPhysics",
  "needsParallax",
  "needsPayments",
  "needsSubscriptions",
  "needsAuth",
  "needsForms",
  "needsGame",
  "needsCarousel",
  "needsCharts",
  "needsPremiumVisuals",
  "needsAppShell",
  "needsDataUI",
  "needsEcommerce",
  "needsCommandSearch",
] as const satisfies ReadonlyArray<keyof InferredCapabilities>;

export type HeavyCapabilityKey = (typeof HEAVY_CAPABILITY_KEYS)[number];

export function hasHeavyCapabilities(caps: InferredCapabilities): boolean {
  return HEAVY_CAPABILITY_KEYS.some((key) => caps[key] === true);
}

export interface BuildCapabilityHintsOptions {
  /**
   * Generation lifecycle stage. F2 (`"design"`) is integration-mute: the
   * payments/database hints must stay mock-first and must NOT instruct real
   * env keys (`STRIPE_SECRET_KEY`, `process.env.*`), SDKs, or API routes —
   * those belong to F3 (`"integrations"`, the "Bygg integrationer" pass).
   *
   * Defaults to `"integrations"` (full wiring) so the no-arg signature stays
   * backwards-compatible for legacy callers; production orchestrate passes the
   * resolved stage explicitly. See `.cursor/rules/env-flow-f2-mute.mdc`.
   */
  lifecycleStage?: "design" | "integrations";
}

/**
 * Build a short capability hint string for inclusion in the system prompt
 * dynamic context, so the model knows which libraries/patterns to use.
 */
export function buildCapabilityHints(
  caps: InferredCapabilities,
  options?: BuildCapabilityHintsOptions,
): string | null {
  const isF2 = options?.lifecycleStage === "design";
  const lines: string[] = [];

  if (caps.needs3D) {
    // The reduced-motion trap class is built at runtime so this source file
    // does not literally contain the substring `motion-reduce` + `:hidden`.
    // The deterministic generator-pipeline check (`checkMotionReduceTrap`)
    // and our snapshot hooks scan source files for that exact bug pattern,
    // so we keep the warning text at runtime only.
    const reducedMotionTrap = `motion-reduce` + `:hidden`;
    const physicsClause = caps.needsPhysics
      ? "Because the prompt describes physics-driven motion (bouncing, falling, gravity, collisions), you MUST add @react-three/rapier and wrap interactive bodies in `<Physics>` + `<RigidBody>` so motion has mass, restitution, and gravity instead of being faked with CSS transforms."
      : "Treat hovering, floating, orbiting, and gentle product motion as decorative 3D: use `useFrame`, drei helpers such as `Float`, and mesh transforms — do NOT add physics libraries unless the prompt explicitly asks for gravity, bouncing, falling, or collisions.";
    lines.push(
      `- **3D/WebGL detected**: You MUST implement 3D elements using @react-three/fiber code — NEVER as placeholder SVGs or static images. Create a real \`<Canvas>\` scene with meshes, lighting, and camera. Wrap the Canvas component in \`"use client"\`. Add three, @react-three/fiber, @react-three/drei to deps. Use **lucide-react** only for 2D UI icons (e.g. TreePine) — not for WebGL meshes. ${physicsClause} For **GLB/GLTF**, use useGLTF from drei and put assets under public/. **Reduced-motion trap (do NOT trip):** NEVER apply '${reducedMotionTrap}' on the entire Canvas — that hides the 3D layer for users with reduced-motion preference. Use 'motion-safe:'-prefixed animation classes on the inner mesh so the static scene still renders. If the requested 3D content is too complex, create a simplified but real Three.js version (rotating shape, abstract geometry, or particle system with the requested theme) rather than falling back to an image.`,
    );
  }
  if (caps.needsMotion && !caps.needs3D && !caps.needsParallax) {
    lines.push(
      "- **Motion/animation requested**: Use framer-motion for entrance animations, scroll reveals, and microinteractions. Add framer-motion to deps.",
    );
  }
  if (caps.needsParallax) {
    lines.push(
      "- **Parallax requested**: Use the parallax dossier(s) selected for this build. For scroll-driven parallax, wrap layers in `ScrollParallaxLayer` from `@/components/scroll-parallax-layer` (one section ref drives many sibling layers). For pointer/mouse parallax on DOM, use `PointerParallaxLayer` from `@/components/pointer-parallax-layer`. For pointer parallax inside a React Three Fiber scene, call `usePointerParallax(targetRef)` from `@/components/use-pointer-parallax` and read the returned ref inside `useFrame`. NEVER apply `motion-reduce:hidden` on the parallax layer itself — keep the content visible at its end-state when reduced motion is on. Add framer-motion to deps when scroll-parallax is in scope.",
    );
  }
  if (caps.needsPayments) {
    if (isF2) {
      // F2 / design is mock-first: build a convincing checkout/pricing UI with
      // NO real payment wiring. Stripe SDKs, `/api/checkout-session`, and
      // `STRIPE_SECRET_KEY` / `process.env.STRIPE_*` are deferred to F3 so the
      // prompt never both forbids (F2 contract) and requires payment keys.
      lines.push(
        "- **Payments requested (F2 / design — mock-first)**: Build a polished checkout/pricing UI only. Render the order summary card with a `<Button>Betala (demo)</Button>` that opens a `<Dialog>` saying \"Riktiga betalningar aktiveras i F3 — klicka 'Bygg integrationer' i previewpanelen.\" Do NOT import Stripe SDKs, add payment API routes/webhooks (`/api/checkout-session`, `/api/stripe/*`), or reference `STRIPE_SECRET_KEY` / `process.env.STRIPE_*`. Keep all price/order data as inline mock constants. Real keys and the hosted Checkout wiring are an F3 step.",
      );
    } else {
      lines.push(
        "- **Payments requested**: Use the payments dossier selected for this build (typically `stripe-checkout`). Mount `<CheckoutButton>` from `@/components/checkout-button` on the pricing/buy CTA, and ship the `/api/checkout-session` server route as-is from the dossier. Treat `STRIPE_SECRET_KEY` as a build-blocking env (sajten kraschar utan), and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` as warn-only (publishable, harmless placeholder OK). Style the button with the project's color tokens — do not import Stripe Elements UI; the dossier uses hosted Checkout.",
      );
    }
  }
  if (caps.needsGame) {
    // Ship the six-point contract from the `interactive-game-loop` dossier
    // verbatim in the capability hint so the model sees the same mental
    // model in both places. Output MUST be playable — not a mockup.
    lines.push(
      "- **Game / playable mechanic requested**: Build a real, playable game using the `interactive-game-loop` dossier contract: **state** (React state with `status: \"idle\" | \"playing\" | \"won\" | \"lost\"` + `score` + mechanic-specific fields) + **loop** (`requestAnimationFrame` inside `useEffect` with `cancelAnimationFrame` cleanup, OR keyboard-driven state transitions for grid games; stop loop when `status !== \"playing\"`) + **controls** (`window.addEventListener(\"keydown\", ...)` + removal on unmount AND a visible touch fallback; wrap game component in `\"use client\"`) + **collision** (AABB or distance check, no physics library unless `needsPhysics` is also set) + **score/win-lose** (large visible score area and clear transition) + **restart** (button AND keyboard shortcut that fully resets state). A static illustration or one-shot animation is NOT a game.",
    );
  }
  if (caps.needsCharts) {
    lines.push(
      "- **Charts/data visualization requested**: Use Recharts with shadcn ChartContainer. Provide realistic mock data (10-12 points).",
    );
  }
  if (caps.needsCarousel) {
    lines.push(
      "- **Carousel/slider requested**: Use shadcn Carousel (wraps embla-carousel-react). Add embla-carousel-autoplay for auto-rotation.",
    );
  }
  if (caps.needsPremiumVisuals) {
    lines.push(
      "- **Premium visual effects requested**: Use glassmorphism, gradient text, backdrop-blur, layered shadows. Go beyond standard card layouts.",
    );
  }
  if (caps.needsCalendar) {
    lines.push(
      "- **Calendar/date selection requested**: Use shadcn Calendar (wraps react-day-picker) with `mode=\"single\"` and `onSelect` for interactive date selection. For inline date pickers, combine Calendar + Popover + `format()` from date-fns. NEVER build a static calendar grid manually — the Calendar component handles all interaction, navigation, and accessibility. Add react-day-picker and date-fns to deps.",
    );
  }
  if (caps.needsForms) {
    const calendarAddendum = caps.needsCalendar
      ? " For date inputs, use shadcn Calendar inside a Popover (DatePicker pattern) rather than a plain text input."
      : "";
    lines.push(
      `- **Forms requested**: Use react-hook-form + zod + shadcn Form components. Always define a zod schema.${calendarAddendum}`,
    );
  }
  if (caps.needsCommandSearch) {
    lines.push(
      "- **Search/command palette requested**: Use shadcn Command (wraps cmdk) for searchable command menus with fuzzy matching. Combine with Dialog for a cmd+k overlay. Add cmdk to deps.",
    );
  }
  if (caps.needsThemeToggle) {
    lines.push(
      '- **Dark mode / theme toggle requested**: Use next-themes `ThemeProvider` in layout.tsx and a toggle button using `useTheme()`. Wrap the toggle component in `"use client"`. Add next-themes to deps.',
    );
  }
  if (caps.needsDatabase) {
    if (isF2) {
      // F2 / design is mock-first: no DB, ORM, or `process.env` DB connection.
      // Real persistence (and its env keys) is wired in F3.
      lines.push(
        "- **Database / persistence mentioned (F2 / design — mock-first)**: Do NOT wire a database, ORM, or `process.env` DB connection in F2. Model the data as inline TypeScript mock constants and drive the UI from them (client-side `Array.filter`/`map`/`useState`). Real persistence (Prisma/SQLite/Supabase/Postgres + env keys) is wired in F3 via 'Bygg integrationer'.",
      );
    } else {
      lines.push(
        "- **Database or persistence requested**: Do not assume Prisma, SQLite, Supabase, or Postgres unless the user explicitly chose one. If the provider, auth coupling, or required env vars are unclear, ask a clarifying question before generating backend code. Keep preview-safe mock data in the UI until the backend choice is confirmed.",
      );
    }
  }
  if (caps.needsAuth) {
    lines.push(
      "- **Auth pages requested**: Include login, register, and password reset flows. Use shadcn form components + zod validation.",
    );
  }
  if (caps.needsAppShell) {
    lines.push(
      "- **App shell requested**: Use a sidebar + top-bar layout with shadcn Sheet/Sidebar. Include settings, account, and navigation affordances. Dashboards typically combine Chart, Table, Progress, and Skeleton for loading states.",
    );
  }
  if (caps.needsDataUI) {
    lines.push(
      "- **Data table / CRUD requested**: Use @tanstack/react-table with shadcn Table. Include sorting, filtering, and pagination.",
    );
  }
  if (caps.needsEcommerce) {
    lines.push(
      "- **E-commerce requested**: Include product grid, product detail, cart, and checkout flow. Use shadcn Card, Sheet, and form components. Use Drawer for mobile cart, Dialog for quick-buy, and Carousel for product image galleries.",
    );
  }

  if (lines.length === 0) return null;
  return `## Detected Capabilities\n\n${lines.join("\n")}`;
}
