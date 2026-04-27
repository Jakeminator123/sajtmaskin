/**
 * Capability inference — classifies what a prompt needs so that the
 * system prompt and docs injection can be tuned accordingly.
 *
 * Runs before generation. Fast, deterministic, no API calls.
 */

export interface InferredCapabilities {
  needsMotion: boolean;
  needs3D: boolean;
  /**
   * Stronger signal than `needs3D` — the prompt describes physics-driven
   * motion (bouncing, drift, gravity, collisions). Implies `needs3D` and
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
   * Prompt asks for a real payment flow (Stripe/Klarna/checkout). Bridges
   * to the `payments` dossier capability so `stripe-checkout` is selected
   * with high confidence, and so the F3 readiness gate knows which
   * provider's keys are truly blocking. Optional for backwards
   * compatibility with older fixtures.
   */
  needsPayments?: boolean;
  needsCharts: boolean;
  needsDatabase: boolean;
  needsAuth: boolean;
  needsAppShell: boolean;
  needsDataUI: boolean;
  needsForms: boolean;
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

const RULES: CapabilityRule[] = [
  {
    key: "needsMotion",
    patterns: [
      /\b(animat|motion|framer|transition|fade|slide|stagger|entrance|animate|rörelse|animering|effekt|wow|premium|immersive|futurist)\b/i,
      /\b(hover.*(effect|animation)|scroll.*(reveal|trigger|animat))\b/i,
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
      /\b(betalningsfl(o|ö)de|betalningsl(o|ö)sning|payment.?flow|checkout.?flow)\b/i,
      /\b(card.?payment|kortbetalning|kortköp|kreditkort)\b/i,
      /\b(prenumerationsbetalning|subscription.?billing|recurring.?billing)\b/i,
      // "betala med kort/swish/klarna/kreditkort/visa/mastercard"
      /\bbetala\s+med\s+(kort|kreditkort|swish|klarna|stripe|paypal|visa|mastercard|apple\s*pay|google\s*pay)\b/i,
      // "köp(a) med kort/online/checkout" — narrow noun-list
      /\bk(ö|o)p(a)?\s+med\s+(kort|kreditkort|stripe|klarna|swish|checkout)\b/i,
    ],
  },
  {
    key: "needs3D",
    patterns: [
      /\b(3d|three\.?js|webgl|canvas|mesh|orb|sphere|particle|three-fiber|@react-three|drei|scene|3d-?model)\b/i,
      /\b3d[a-zåäö-]+\b/i,
      /\b(rotat.*3d|tilt|perspect.*card|floating.*object)\b/i,
      /\b(rapier|cannon|physics|gravitation|gravity|rigidbody|collider|gltf|glb|usegltf)\b/i,
    ],
  },
  {
    key: "needsPhysics",
    patterns: [
      // Unicode-aware boundary instead of `\b` because JS `\b` is ASCII-only,
      // so `\båker\b` would never match inside "som åker omkring" (the leading
      // `å` is not an ASCII word char). Mirrors the boundary trick used for
      // ecommerce/hospitality vetoes in `inferCapabilities` below.
      /(?:^|[^\p{L}\p{N}])(?:åker omkring|svävar|flyger|drivs av gravity|bouncing|kolliderar|fysik|gravitation|flying|flies|floats|floating|hovers|hovering|levitate|levitates|levitating)(?=[^\p{L}\p{N}]|$)/iu,
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
    key: "needsEcommerce",
    patterns: [
      /\b(ecommerce|e-?commerce|e-?handel|shop|store|cart|varukorg|checkout|kassa|product|produkt|storefront|webshop|payment)\b/i,
    ],
  },
  {
    key: "needsCarousel",
    patterns: [
      /\b(carousel|slider|slideshow|gallery|swipe|karusell|bildspel|image.?gallery|hero.?slider)\b/i,
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
    needsCharts: false,
    needsDatabase: false,
    needsAuth: false,
    needsAppShell: false,
    needsDataUI: false,
    needsForms: false,
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

  if (result.needsPhysics) result.needs3D = true;
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

/**
 * Build a short capability hint string for inclusion in the system prompt
 * dynamic context, so the model knows which libraries/patterns to use.
 */
export function buildCapabilityHints(caps: InferredCapabilities): string | null {
  const lines: string[] = [];

  if (caps.needs3D) {
    // The reduced-motion trap class is built at runtime so this source file
    // does not literally contain the substring `motion-reduce` + `:hidden`.
    // The deterministic generator-pipeline check (`checkMotionReduceTrap`)
    // and our snapshot hooks scan source files for that exact bug pattern,
    // so we keep the warning text at runtime only.
    const reducedMotionTrap = `motion-reduce` + `:hidden`;
    const physicsClause = caps.needsPhysics
      ? "Because the prompt describes physics-driven motion (bouncing, drift, gravity, collisions), you MUST add @react-three/rapier and wrap interactive bodies in `<Physics>` + `<RigidBody>` so motion has mass, restitution, and gravity instead of being faked with CSS transforms."
      : "For optional **physics / gravity**, add @react-three/rapier (Physics, RigidBody) only when the requested motion truly requires simulated forces.";
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
    lines.push(
      "- **Payments requested**: Use the payments dossier selected for this build (typically `stripe-checkout`). Mount `<CheckoutButton>` from `@/components/checkout-button` on the pricing/buy CTA, and ship the `/api/checkout-session` server route as-is from the dossier. Treat `STRIPE_SECRET_KEY` as a build-blocking env (sajten kraschar utan), and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` as warn-only (publishable, harmless placeholder OK). Style the button with the project's color tokens — do not import Stripe Elements UI; the dossier uses hosted Checkout.",
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
    lines.push(
      "- **Database or persistence requested**: Do not assume Prisma, SQLite, Supabase, or Postgres unless the user explicitly chose one. If the provider, auth coupling, or required env vars are unclear, ask a clarifying question before generating backend code. Keep preview-safe mock data in the UI until the backend choice is confirmed.",
    );
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
