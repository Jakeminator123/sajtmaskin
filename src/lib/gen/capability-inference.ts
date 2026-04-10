/**
 * Capability inference — classifies what a prompt needs so that the
 * system prompt and docs injection can be tuned accordingly.
 *
 * Runs before generation. Fast, deterministic, no API calls.
 */

export interface InferredCapabilities {
  needsMotion: boolean;
  needs3D: boolean;
  needsCharts: boolean;
  needsDatabase: boolean;
  needsAuth: boolean;
  needsAppShell: boolean;
  needsDataUI: boolean;
  needsForms: boolean;
  needsEcommerce: boolean;
  needsCarousel: boolean;
  needsPremiumVisuals: boolean;
}

interface CapabilityRule {
  key: keyof InferredCapabilities;
  patterns: RegExp[];
}

const RULES: CapabilityRule[] = [
  {
    key: "needsMotion",
    patterns: [
      /\b(animat|motion|framer|transition|fade|slide|parallax|stagger|entrance|animate|rörelse|animering|effekt|wow|premium|immersive|futurist)\b/i,
      /\b(hover.*(effect|animation)|scroll.*(reveal|trigger|animat))\b/i,
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
      /\b(auth|login|sign.?up|sign.?in|register|password|forgot.?password|reset.?password|inloggning|registrer|logga.?in|lösenord|konto|session|oauth|jwt)\b/i,
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
      /\b(form|contact.?form|booking|boka|survey|questionnaire|formulär|kontakt|multi.?step|wizard.?form)\b/i,
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
      /\b(premium|luxury|glassmorphism|glass|neon|glow|gradient.?text|blur|frosted|modern.*design|sleek|elegant|sophisticated|futuristisk|exklusiv)\b/i,
      /\b(dark.?mode.*hero|spotlight|cinematic|atmospheric|immersive)\b/i,
      /\b(filmisk|filmiskt|cinematisk|cinematiskt|arkiv.?x|x-files|ufo|paranormal)\b/i,
    ],
  },
];

export function inferCapabilities(prompt: string): InferredCapabilities {
  const result: InferredCapabilities = {
    needsMotion: false,
    needs3D: false,
    needsCharts: false,
    needsDatabase: false,
    needsAuth: false,
    needsAppShell: false,
    needsDataUI: false,
    needsForms: false,
    needsEcommerce: false,
    needsCarousel: false,
    needsPremiumVisuals: false,
  };

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(prompt)) {
        result[rule.key] = true;
        break;
      }
    }
  }

  if (result.needs3D) result.needsMotion = true;
  if (result.needsPremiumVisuals) result.needsMotion = true;

  if (result.needsEcommerce) {
    const hospitalityVeto =
      /\b(restaurang|restaurant|café|cafe|kafé|bistro|hotell|hotel|spa|salong|salon|klinik|clinic|bakeri|bageri|bakery|pizzeria|catering|matrestaurang|boka bord|book a table|meny|menu|öppettider|opening hours)\b/i;
    const strongEcommerceIntent =
      /\b(webshop|webbshop|e-handel|ecommerce|e-commerce|varukorg|kundvagn|cart|checkout|kassa|storefront|nätbutik|online store)\b/i;
    if (hospitalityVeto.test(prompt) && !strongEcommerceIntent.test(prompt)) {
      result.needsEcommerce = false;
    }
  }

  return result;
}

/**
 * Build a short capability hint string for inclusion in the system prompt
 * dynamic context, so the model knows which libraries/patterns to use.
 */
export function buildCapabilityHints(caps: InferredCapabilities): string | null {
  const lines: string[] = [];

  if (caps.needs3D) {
    lines.push(
      "- **3D/WebGL requested**: Use @react-three/fiber + @react-three/drei. Wrap Canvas in a \"use client\" component. Add three, @react-three/fiber, @react-three/drei to deps. Use **lucide-react** only for 2D UI icons (e.g. TreePine) — not for WebGL meshes. For **physics / gravity**, add @react-three/rapier (Physics, RigidBody). For **GLB/GLTF**, use useGLTF from drei and put assets under public/.",
    );
  }
  if (caps.needsMotion && !caps.needs3D) {
    lines.push("- **Motion/animation requested**: Use framer-motion for entrance animations, scroll reveals, and microinteractions. Add framer-motion to deps.");
  }
  if (caps.needsCharts) {
    lines.push("- **Charts/data visualization requested**: Use Recharts with shadcn ChartContainer. Provide realistic mock data (10-12 points).");
  }
  if (caps.needsCarousel) {
    lines.push("- **Carousel/slider requested**: Use shadcn Carousel (wraps embla-carousel-react). Add embla-carousel-autoplay for auto-rotation.");
  }
  if (caps.needsPremiumVisuals) {
    lines.push("- **Premium visual effects requested**: Use glassmorphism, gradient text, backdrop-blur, layered shadows. Go beyond standard card layouts.");
  }
  if (caps.needsForms) {
    lines.push("- **Forms requested**: Use react-hook-form + zod + shadcn Form components. Always define a zod schema.");
  }
  if (caps.needsDatabase) {
    lines.push("- **Database or persistence requested**: Do not assume Prisma, SQLite, Supabase, or Postgres unless the user explicitly chose one. If the provider, auth coupling, or required env vars are unclear, ask a clarifying question before generating backend code. Keep preview-safe mock data in the UI until the backend choice is confirmed.");
  }
  if (caps.needsAuth) {
    lines.push("- **Auth pages requested**: Include login, register, and password reset flows. Use shadcn form components + zod validation.");
  }

  if (lines.length === 0) return null;
  return `## Detected Capabilities\n\n${lines.join("\n")}`;
}
