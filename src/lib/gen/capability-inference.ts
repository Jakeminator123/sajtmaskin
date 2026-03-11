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
      /\b(3d|three\.?js|webgl|canvas|mesh|orb|sphere|particle|three-fiber|drei|scene|3d-?model)\b/i,
      /\b(rotat.*3d|tilt|perspect.*card|floating.*object)\b/i,
    ],
  },
  {
    key: "needsCharts",
    patterns: [
      /\b(chart|graph|diagram|analytics|visuali[sz]|recharts|line.?chart|bar.?chart|pie.?chart|area.?chart|statistik|graf|data.?viz)\b/i,
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
    ],
  },
];

export function inferCapabilities(prompt: string): InferredCapabilities {
  const result: InferredCapabilities = {
    needsMotion: false,
    needs3D: false,
    needsCharts: false,
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

  return result;
}

/**
 * Returns doc snippet category filters based on inferred capabilities,
 * so that the knowledge base search prioritizes relevant docs.
 */
export function capabilitiesToDocCategories(
  caps: InferredCapabilities,
): string[] {
  const hints: string[] = [];
  if (caps.needsMotion) hints.push("animation", "motion", "framer", "transition");
  if (caps.needs3D) hints.push("3d", "three", "webgl", "canvas", "react-three");
  if (caps.needsCharts) hints.push("chart", "recharts", "analytics", "graph");
  if (caps.needsAuth) hints.push("auth", "login", "password", "session");
  if (caps.needsAppShell) hints.push("dashboard", "sidebar", "admin");
  if (caps.needsDataUI) hints.push("data-table", "tanstack", "sorting", "pagination");
  if (caps.needsForms) hints.push("form", "validation", "zod", "react-hook-form");
  if (caps.needsEcommerce) hints.push("ecommerce", "cart", "checkout", "product");
  if (caps.needsCarousel) hints.push("carousel", "embla", "slider");
  if (caps.needsPremiumVisuals) hints.push("gradient", "glass", "blur", "premium");
  return hints;
}

/**
 * Build a short capability hint string for inclusion in the system prompt
 * dynamic context, so the model knows which libraries/patterns to use.
 */
export function buildCapabilityHints(caps: InferredCapabilities): string | null {
  const lines: string[] = [];

  if (caps.needs3D) {
    lines.push("- **3D/WebGL requested**: Use @react-three/fiber + @react-three/drei. Wrap Canvas in a \"use client\" component. Add three, @react-three/fiber, @react-three/drei to deps.");
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
  if (caps.needsAuth) {
    lines.push("- **Auth pages requested**: Include login, register, and password reset flows. Use shadcn form components + zod validation.");
  }

  if (lines.length === 0) return null;
  return `## Detected Capabilities\n\n${lines.join("\n")}`;
}
